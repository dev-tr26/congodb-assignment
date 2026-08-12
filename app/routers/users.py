"""User endpoints: search · profile · friends · recommendations · mutual · path."""
from fastapi import APIRouter

from .. import queries as Q
from ..db import run_query, to_number
from ..errors import ApiError
from ..path import find_path

router = APIRouter()

# How many of the user's friends (most-connected first) the 2-hop
# recommendation walk expands through, and how many candidates it keeps
# before exact mutual counts are computed. Keeps every statement inside
# CognoDB's query deadline even for 1000-friend hubs; see app/queries.py.
RECOMMENDATION_FRIEND_CAP = 100
RECOMMENDATION_POOL_CAP = 250


def _to_user(node):
    """Extract a plain user dict from a driver Node."""
    return {
        "id": to_number(node["id"]),
        "name": node["name"],
        "city": node["city"],
        "job": node["job"],
        "age": to_number(node["age"]),
        "interests": node.get("interests") or [],
        "degree": to_number(node["degree"]),
    }


def _parse_id(raw):
    """Validate a numeric user id from the URL (non-negative integer)."""
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value >= 0 else None


def _clamp_limit(raw, default, minimum, maximum):
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


async def _user_exists(user_id):
    records = await run_query(Q.USER_PROFILE, {"id": user_id})
    return len(records) > 0


@router.get("/search")
async def search(q: str = "", limit: int = 10):
    """Name / id prefix search."""
    q = q.strip()
    if not q:
        return {"query": "", "results": []}
    limit = _clamp_limit(limit, 10, 1, 20)
    records = await run_query(Q.SEARCH, {"q": q, "limit": limit})
    return {"query": q, "results": [_to_user(r["u"]) for r in records]}


@router.get("/{user_id}/path/{other_id}")
async def path(user_id: str, other_id: str):
    """Degrees of separation (shortest path via app-side BFS)."""
    id_a = _parse_id(user_id)
    id_b = _parse_id(other_id)
    if id_a is None or id_b is None:
        raise ApiError(400, "invalid-id", "User ids must be non-negative integers.")
    if id_a == id_b:
        return {"found": True, "degrees": 0, "path": []}

    result = await find_path(id_a, id_b)
    if not result["found"]:
        return {"found": False, "degrees": None, "path": []}

    # Materialise the path nodes (one index-backed query), preserving order.
    records = await run_query(Q.USERS_BY_IDS, {"ids": result["path_ids"]})
    by_id = {to_number(r["u"]["id"]): _to_user(r["u"]) for r in records}
    path_users = [by_id[i] for i in result["path_ids"]]
    return {"found": True, "degrees": result["degrees"], "path": path_users}


@router.get("/{user_id}/recommendations")
async def recommendations(user_id: str, limit: int = 12):
    """Friend-of-friend suggestions, ranked by mutual friend count.

    Three bounded statements: direct-friend ids → candidate pool → exact
    mutual counts. See app/queries.py for why each piece looks the way it
    does on CognoDB.
    """
    user = _parse_id(user_id)
    if user is None:
        raise ApiError(400, "invalid-id", "User id must be a non-negative integer.")
    limit = _clamp_limit(limit, 12, 1, 50)

    friend_records = await run_query(Q.FRIEND_IDS, {"id": user})
    friend_ids = [to_number(r["id"]) for r in friend_records]

    pool = await run_query(
        Q.RECOMMENDATION_POOL,
        {
            "userId": user,
            "friendLimit": RECOMMENDATION_FRIEND_CAP,
            "friendIds": friend_ids,
            "poolLimit": RECOMMENDATION_POOL_CAP,
        },
    )
    if not pool and not await _user_exists(user):
        raise ApiError(404, "not-found", f"No user with id {user}.")

    candidates = [r["candidate"] for r in pool]
    candidate_ids = [to_number(c["id"]) for c in candidates]

    # Exact shared-friend counts for every candidate (one bounded query),
    # so the badge always matches the mutual-friends tab.
    counts = {}
    if candidate_ids:
        count_records = await run_query(
            Q.RECOMMENDATION_COUNTS,
            {"userId": user, "candidateIds": candidate_ids},
        )
        counts = {to_number(r["id"]): to_number(r["mutualCount"]) for r in count_records}

    recommendations = [
        {"user": _to_user(node), "mutualCount": counts.get(to_number(node["id"]), 0)}
        for node in candidates
    ]
    recommendations.sort(
        key=lambda r: (-r["mutualCount"], -r["user"]["degree"], r["user"]["id"])
    )
    return {"recommendations": recommendations[:limit]}


@router.get("/{user_id}/friends")
async def friends(user_id: str, limit: int = 48):
    """Direct friends, most-connected first."""
    user = _parse_id(user_id)
    if user is None:
        raise ApiError(400, "invalid-id", "User id must be a non-negative integer.")
    limit = _clamp_limit(limit, 48, 1, 200)
    records = await run_query(Q.FRIENDS, {"id": user, "limit": limit})
    if not records and not await _user_exists(user):
        raise ApiError(404, "not-found", f"No user with id {user}.")
    return {"friends": [_to_user(r["f"]) for r in records]}


@router.get("/{user_id}/mutual/{other_id}")
async def mutual(user_id: str, other_id: str):
    """Shared friends between two users."""
    id_a = _parse_id(user_id)
    id_b = _parse_id(other_id)
    if id_a is None or id_b is None:
        raise ApiError(400, "invalid-id", "User ids must be non-negative integers.")
    if id_a == id_b:
        return {"mutual": [], "note": "same-user"}
    records = await run_query(Q.MUTUAL_FRIENDS, {"idA": id_a, "idB": id_b})
    return {"mutual": [_to_user(r["m"]) for r in records]}


@router.get("/{user_id}")
async def profile(user_id: str):
    """Full profile."""
    user = _parse_id(user_id)
    if user is None:
        raise ApiError(400, "invalid-id", "User id must be a non-negative integer.")
    records = await run_query(Q.USER_PROFILE, {"id": user})
    if not records:
        raise ApiError(404, "not-found", f"No user with id {user}.")
    return {"user": _to_user(records[0]["u"])}
