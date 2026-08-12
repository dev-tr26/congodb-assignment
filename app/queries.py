"""
All Cypher queries used by the application.

Every query is parameterised — user input is only ever passed through
`$params`, never concatenated into the query string.

The same queries are documented for humans in `cypher/queries.cypher`;
keep the two files in sync.
"""

# ── Core feature: friend-of-friend recommendations ─────────────────────
# Three small, bounded statements composed in app/routers/users.py —
# deliberate, verified CognoDB choices:
#
# 1. The direct-friend exclusion is expressed with an id list
#    (`NOT candidate.id IN $friendIds`, fetched by FRIEND_IDS) instead of
#    a `NOT (me)-[:FRIENDS_WITH]->(candidate)` pattern predicate — CognoDB
#    evaluates that pattern predicate to zero rows, silently killing the
#    query's results.
# 2. The 2-hop walk is bounded: we only expand through the user's top
#    `$friendLimit` friends (by connection count). On the free tier an
#    unbounded walk from a high-degree hub (1000+ friends) exceeds the
#    server's query deadline. Most-connected friends carry most of the
#    recommendation signal; for typical users the limit never binds.
# 3. Mutual counts are computed exactly afterwards (RECOMMENDATION_COUNTS)
#    over the candidate pool, so a shown candidate's badge always matches
#    its real shared-friend count.

# Ids of a user's direct friends — feeds the $friendIds exclusion below.
FRIEND_IDS = """
MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User)
RETURN f.id AS id
"""

# Bounded 2-hop candidate pool (no aggregation — just the candidates).
RECOMMENDATION_POOL = """
MATCH (me:User {id: $userId})-[:FRIENDS_WITH]->(friend:User)
WITH me, friend
ORDER BY friend.degree DESC
LIMIT $friendLimit
MATCH (friend)-[:FRIENDS_WITH]->(candidate:User)
WHERE candidate.id <> $userId
  AND NOT candidate.id IN $friendIds
RETURN DISTINCT candidate
ORDER BY candidate.degree DESC, candidate.id ASC
LIMIT $poolLimit
"""

# Exact shared-friend count per candidate id.
RECOMMENDATION_COUNTS = """
MATCH (me:User {id: $userId})-[:FRIENDS_WITH]->(m:User)<-[:FRIENDS_WITH]-(candidate:User)
WHERE candidate.id IN $candidateIds
RETURN candidate.id AS id, count(m) AS mutualCount
"""

# ── A user's direct friends, most-connected first ──────────────────────
FRIENDS = """
MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User)
RETURN f
ORDER BY f.degree DESC, f.id ASC
LIMIT $limit
"""

# ── Single-user lookup ─────────────────────────────────────────────────
USER_PROFILE = """
MATCH (u:User {id: $id})
RETURN u
"""

# ── Search (name substring + id prefix) ────────────────────────────────
SEARCH = """
MATCH (u:User)
WHERE toLower(u.name) CONTAINS toLower($q)
   OR toString(u.id) STARTS WITH $q
RETURN u
ORDER BY u.degree DESC, u.id ASC
LIMIT $limit
"""

# ── Mutual friends shared by two users (the "how do you know them" query)
MUTUAL_FRIENDS = """
MATCH (a:User {id: $idA})-[:FRIENDS_WITH]->(m:User)<-[:FRIENDS_WITH]-(b:User {id: $idB})
RETURN m
ORDER BY m.degree DESC, m.id ASC
"""

# ── Degrees of separation (see app/path.py) ────────────────────────────
# CognoDB's `shortestPath` has a hard BFS budget (5 s) that this graph
# exhausts, so the BFS is driven from the application one hop at a time —
# each hop is this cheap, bounded, index-backed query.

# Expand a frontier: all friends of the given user ids, grouped by owner.
FRIENDS_BY_IDS = """
MATCH (u:User) WHERE u.id IN $ids
MATCH (u)-[:FRIENDS_WITH]->(f:User)
RETURN u.id AS uid, collect(f) AS friends
"""

# Fetch full nodes for a list of ids, used to materialise a found path.
USERS_BY_IDS = """
MATCH (u:User) WHERE u.id IN $ids
RETURN u
"""

# ── Network stats ──────────────────────────────────────────────────────
STATS_USERS = "MATCH (u:User) RETURN count(u) AS users"
STATS_FRIENDSHIPS = "MATCH ()-[:FRIENDS_WITH]->() RETURN count(*) AS friendships"
STATS_DEGREES = "MATCH (u:User) RETURN avg(u.degree) AS avgDegree, max(u.degree) AS maxDegree"

# ── Most-connected users, for the home page ────────────────────────────
TOP_USERS = """
MATCH (u:User)
RETURN u
ORDER BY u.degree DESC, u.id ASC
LIMIT $limit
"""

# ── Seed-time queries (used by scripts/seed.py) ────────────────────────

DROP_ALL = "MATCH (n) DETACH DELETE n"

CREATE_INDEX_USER_ID = "CREATE INDEX user_id IF NOT EXISTS FOR (u:User) ON (u.id)"
CREATE_INDEX_USER_NAME = "CREATE INDEX user_name IF NOT EXISTS FOR (u:User) ON (u.name)"

UPSERT_USERS = """
UNWIND $users AS u
MERGE (user:User {id: u.id})
SET user.name = u.name,
    user.city = u.city,
    user.job = u.job,
    user.age = u.age,
    user.interests = u.interests,
    user.degree = u.degree
"""

UPSERT_EDGES = """
UNWIND $batch AS e
MATCH (a:User {id: e[0]}), (b:User {id: e[1]})
MERGE (a)-[:FRIENDS_WITH]->(b)
MERGE (b)-[:FRIENDS_WITH]->(a)
"""

COUNT_USERS = "MATCH (u:User) RETURN count(u) AS n"
COUNT_EDGES = "MATCH ()-[:FRIENDS_WITH]->() RETURN count(*) AS n"
