"""
Degrees of separation — shortest path via an application-side
bidirectional BFS.

CognoDB's built-in `shortestPath` carries a hard BFS budget (5 s) that
this graph exhausts on the free tier, so we drive the traversal from the
application instead: each hop is one cheap, bounded, index-backed query
(FRIENDS_BY_IDS), and the two sides meet in the middle. This keeps every
individual statement well within the server's query deadline and returns
an exact shortest path (the search is a true BFS; the frontier cap only
bounds how many nodes we expand per level on pathological hubs).
"""
from .db import run_query
from .queries import FRIENDS_BY_IDS

MAX_DEPTH = 8
FRONTIER_CAP = 250


async def _expand(frontier, my_parents, their_parents):
    """Expand one frontier one hop.

    For every id in `frontier`, fetch its friends and record them as
    discovered from their owner. Returns (next_frontier, hit) where `hit`
    is the first node already discovered from the *other* side — i.e. the
    meeting point — or None.
    """
    ids = list(frontier[:FRONTIER_CAP])
    rows = await run_query(FRIENDS_BY_IDS, {"ids": ids})
    nxt = []
    for row in rows:
        uid = int(row["uid"])
        for friend in row["friends"]:
            fid = int(friend["id"])
            if fid in my_parents:
                continue
            my_parents[fid] = uid
            if fid in their_parents:
                return nxt, fid
            nxt.append(fid)
    return nxt, None


def _build_path(hit, parent_a, parent_b):
    """Reconstruct the id chain [idA, …, hit, …, idB] from both parent maps."""
    from_a = []
    node = hit
    while node is not None:
        from_a.append(node)
        node = parent_a.get(node)
    from_b = []
    node = hit
    while node is not None:
        from_b.append(node)
        node = parent_b.get(node)
    path_ids = list(reversed(from_a)) + from_b[1:]
    return {"found": True, "degrees": len(path_ids) - 1, "path_ids": path_ids}


async def find_path(id_a, id_b):
    """Shortest path between two users, as an id chain, or
    `{"found": False, ...}` when no path exists within MAX_DEPTH hops."""
    if id_a == id_b:
        return {"found": True, "degrees": 0, "path_ids": [id_a]}

    parent_a = {id_a: None}
    parent_b = {id_b: None}
    front_a = [id_a]
    front_b = [id_b]

    for _ in range(MAX_DEPTH):
        # Expand the smaller frontier first — explores the cheaper side
        # first and keeps hub-sized frontiers from ballooning on either side.
        if len(front_a) <= len(front_b):
            nxt, hit = await _expand(front_a, parent_a, parent_b)
            if hit is not None:
                return _build_path(hit, parent_a, parent_b)
            front_a = nxt
            nxt, hit = await _expand(front_b, parent_b, parent_a)
            if hit is not None:
                return _build_path(hit, parent_a, parent_b)
            front_b = nxt
        else:
            nxt, hit = await _expand(front_b, parent_b, parent_a)
            if hit is not None:
                return _build_path(hit, parent_a, parent_b)
            front_b = nxt
            nxt, hit = await _expand(front_a, parent_a, parent_b)
            if hit is not None:
                return _build_path(hit, parent_a, parent_b)
            front_a = nxt

        if not front_a or not front_b:
            break

    return {"found": False, "degrees": None, "path_ids": None}
