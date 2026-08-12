"""
Seed the graph database with the SNAP Facebook friendship network.

  python scripts/seed.py                  # load the full network
  python scripts/seed.py --limit 5000     # only the first 5,000 edges (quick smoke test)
  python scripts/seed.py --fresh          # wipe the database first

Every Cypher statement is parameterised (UNWIND + $params), never
string-concatenated.
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Windows consoles default to cp1252; force UTF-8 so the box-drawing output
# doesn't crash with a UnicodeEncodeError.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app import config, queries as Q  # noqa: E402
from app.db import close_driver, get_driver, run_query  # noqa: E402
from scripts.dataset import DATASET_URL, LOCAL_FILE, ensure_dataset, read_edges  # noqa: E402
from scripts.profiles import build_profiles  # noqa: E402


async def main(args):
    # 1. Make sure we have a dataset
    file = ensure_dataset()
    print(f"\nUsing dataset: {file} ({DATASET_URL})")
    all_edges = read_edges(file)
    edges = all_edges[: args.limit] if args.limit else all_edges
    print(f"Edges to load: {len(edges):,}")

    # 2. Compute per-node degree and build deterministic profiles
    degree = {}
    for a, b in edges:
        degree[a] = degree.get(a, 0) + 1
        degree[b] = degree.get(b, 0) + 1
    ids = sorted(degree)
    users = []
    for profile in build_profiles(ids):
        profile["degree"] = degree[profile["id"]]
        users.append(profile)
    print(f"Users to load: {len(users):,}")

    # 3. Connect
    try:
        await get_driver().verify_connectivity()
    except Exception:
        print(
            f"\n✖ Could not reach the graph database at {config.NEO4J_URI}.\n"
            "  • For CognoDB: set NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD in .env (see .env.example).\n"
            "  • For local testing: run \"docker compose up -d neo4j\" first, then this script.\n"
        )
        sys.exit(1)
    print("✔ Connected to the graph database\n")

    # 4. Optional clean slate
    if args.fresh:
        print("--fresh: wiping existing data …")
        await run_query(Q.DROP_ALL)

    # 5. Indexes (idempotent)
    print("Creating indexes …")
    await run_query(Q.CREATE_INDEX_USER_ID)
    await run_query(Q.CREATE_INDEX_USER_NAME)

    # 6. Users in a single batched, parameterised statement
    print(f"Loading {len(users):,} users …")
    await run_query(Q.UPSERT_USERS, {"users": users})
    print("  users ✔")

    # 7. Edges, both directions (the network is undirected). A single
    #    parameterised UNWIND statement — one transaction, idempotent via MERGE.
    print(f"Loading {len(edges):,} friendships …")
    await run_query(Q.UPSERT_EDGES, {"batch": [list(e) for e in edges]})
    print("  friendships ✔\n")

    # 8. Verify
    users_rec = await run_query(Q.COUNT_USERS)
    edges_rec = await run_query(Q.COUNT_EDGES)
    stored_users = users_rec[0]["n"]
    stored_edges = edges_rec[0]["n"] / 2

    print("─────────────── seed complete ───────────────")
    print(f"  Users:        {stored_users:,}")
    print(f"  Friendships:  {stored_edges:,.0f}")
    print("─────────────────────────────────────────────\n")
    print("Next: python -m uvicorn main:app --port 3000, then open http://localhost:3000")

    await close_driver()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the Six Degrees graph database.")
    parser.add_argument("--limit", type=int, default=None, help="Only load the first N edges")
    parser.add_argument("--fresh", action="store_true", help="Wipe the database first")
    args = parser.parse_args()
    asyncio.run(main(args))
