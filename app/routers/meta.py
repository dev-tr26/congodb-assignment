"""Meta endpoints: health, stats, and most-connected users (home page)."""
import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import queries as Q
from ..db import check_health, run_query, to_number

router = APIRouter()


def _to_user_short(node):
    props = node
    return {
        "id": to_number(props["id"]),
        "name": props["name"],
        "city": props["city"],
        "job": props["job"],
        "degree": to_number(props["degree"]),
    }


@router.get("/health")
async def health():
    """Used by the UI banner; 200 when DB reachable, 503 otherwise."""
    status = await check_health()
    if status["ok"]:
        return {"status": "ok", "detail": None}
    return JSONResponse(
        status_code=503,
        content={"status": "unreachable", "detail": status["error"]},
    )


@router.get("/stats")
async def stats():
    """Network-wide numbers for the home page."""
    users_rec, edges_rec, deg_rec = await asyncio.gather(
        run_query(Q.STATS_USERS),
        run_query(Q.STATS_FRIENDSHIPS),
        run_query(Q.STATS_DEGREES),
    )
    # FRIENDS_WITH is stored in both directions, so divide by two.
    return {
        "users": to_number(users_rec[0]["users"]),
        "friendships": round(to_number(edges_rec[0]["friendships"]) / 2),
        "avgDegree": round(float(deg_rec[0]["avgDegree"]), 1),
        "maxDegree": to_number(deg_rec[0]["maxDegree"]),
    }


@router.get("/top")
async def top(limit: int = 10):
    """Most-connected people (home page grid)."""
    limit = max(1, min(50, limit))
    records = await run_query(Q.TOP_USERS, {"limit": limit})
    return {"users": [_to_user_short(r["u"]) for r in records]}
