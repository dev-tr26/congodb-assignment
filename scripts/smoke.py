"""
Smoke test — runs every headline query against a live database and prints
the results. Useful for verifying a fresh seed or a CognoDB instance.

  python scripts/smoke.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Windows consoles default to cp1252; force UTF-8 so the box-drawing output
# doesn't crash with a UnicodeEncodeError.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app import queries as Q  # noqa: E402
from app.db import close_driver, get_driver, run_query, to_number  # noqa: E402
from app.path import find_path  # noqa: E402


def _fmt_num(value):
    """Print whole floats as ints (the DB stores degree as a Float)."""
    return int(value) if float(value).is_integer() else value


async def main():
    try:
        await get_driver().verify_connectivity()
    except Exception as err:
        print("✖ Database unreachable:", err)
        sys.exit(1)

    # Stats
    users_rec, edges_rec, deg_rec = await asyncio.gather(
        run_query(Q.STATS_USERS),
        run_query(Q.STATS_FRIENDSHIPS),
        run_query(Q.STATS_DEGREES),
    )
    print("── Stats ────────────────────────────────────────")
    print("users:", to_number(users_rec[0]["users"]))
    print("friendships:", _fmt_num(to_number(edges_rec[0]["friendships"]) / 2))
    print(
        "avgDegree:",
        round(float(deg_rec[0]["avgDegree"]), 1),
        "| maxDegree:",
        to_number(deg_rec[0]["maxDegree"]),
    )

    # Pick the most-connected user as our demo "me"
    top_rec = await run_query(Q.TOP_USERS, {"limit": 1})
    me = top_rec[0]["u"]
    print(
        f"\n── Demo user: {me['name']} (id {to_number(me['id'])}, "
        f"{_fmt_num(to_number(me['degree']))} friends) ──"
    )

    # Core: recommendations ranked by mutual friend count (bounded 2-hop
    # pool + exact mutual counts)
    friend_records = await run_query(Q.FRIEND_IDS, {"id": me["id"]})
    friend_ids = [to_number(r["id"]) for r in friend_records]
    pool = await run_query(
        Q.RECOMMENDATION_POOL,
        {"userId": me["id"], "friendLimit": 100, "friendIds": friend_ids, "poolLimit": 250},
    )
    candidates = [r["candidate"] for r in pool]
    candidate_ids = [to_number(c["id"]) for c in candidates]
    counts = {}
    if candidate_ids:
        count_records = await run_query(
            Q.RECOMMENDATION_COUNTS,
            {"userId": me["id"], "candidateIds": candidate_ids},
        )
        counts = {to_number(r["id"]): to_number(r["mutualCount"]) for r in count_records}
    recs = sorted(
        [{"node": c, "count": counts.get(to_number(c["id"]), 0)} for c in candidates],
        key=lambda r: (-r["count"], -r["node"]["degree"], to_number(r["node"]["id"])),
    )[:5]
    print("\nRecommendations (friends-of-friends, ranked by mutual friends):")
    for rec in recs:
        c = rec["node"]
        print(f"  #{to_number(c['id'])} {c['name']} — {rec['count']} mutual friends")

    # Friends
    friends = await run_query(Q.FRIENDS, {"id": me["id"], "limit": 5})
    print("\nDirect friends (first 5):")
    for r in friends:
        f = r["f"]
        print(f"  #{to_number(f['id'])} {f['name']} ({f['city']})")

    # Mutual friends with the first suggestion (badge count should match)
    if recs:
        other = recs[0]["node"]
        mutual = await run_query(Q.MUTUAL_FRIENDS, {"idA": me["id"], "idB": to_number(other["id"])})
        print(f"\nMutual friends with {other['name']} (badge said {recs[0]['count']}):")
        for r in mutual:
            m = r["m"]
            print(f"  #{to_number(m['id'])} {m['name']}")

    # Degrees of separation between me and the least-connected user
    deg_recs = await run_query(
        "MATCH (u:User) RETURN u ORDER BY u.degree ASC, u.id ASC LIMIT $limit",
        {"limit": 1},
    )
    far = deg_recs[0]["u"]
    result = await find_path(to_number(me["id"]), to_number(far["id"]))
    print(f"\nDegrees of separation between {me['name']} and {far['name']}:")
    if not result["found"]:
        print("  No connection within 8 hops.")
    else:
        name_recs = await run_query(Q.USERS_BY_IDS, {"ids": result["path_ids"]})
        by_id = {to_number(r["u"]["id"]): r["u"]["name"] for r in name_recs}
        names = [by_id[i] for i in result["path_ids"]]
        print(f"  {result['degrees']} hop(s): {' → '.join(names)}")

    # Search
    search = await run_query(Q.SEARCH, {"q": "ana", "limit": 5})
    print('\nSearch "ana":')
    for r in search:
        u = r["u"]
        print(f"  #{to_number(u['id'])} {u['name']}")

    print("\n✔ All queries completed.")
    await close_driver()


if __name__ == "__main__":
    asyncio.run(main())
