// ─────────────────────────────────────────────────────────────────────
// Six Degrees — Cypher queries
//
// The same queries live in src/queries.js (the single source of truth
// used by the application). This file is the human-readable reference.
// All queries are parameterised — never string-concatenated.
//
// Schema:
//   (:User {id, name, city, job, age, interests, degree})
//   (:User)-[:FRIENDS_WITH]->(:User)   // stored in both directions
// ─────────────────────────────────────────────────────────────────────

// ── 1. Core feature: friend-of-friend recommendations ────────────────
// 2-hop traversal: me → friend → candidate, ranked by mutual friend count.
// Composed from three small, bounded statements (see src/routes/users.js):
//
//  (a) direct-friend ids for the exclusion, because CognoDB evaluates
//      `NOT (a)-[:R]->(b)` pattern predicates to zero rows;
//  (b) a bounded candidate pool — expand through the user's top
//      `$friendLimit` friends by connection count so the statement stays
//      inside the query deadline even for 1000-friend hubs;
//  (c) exact mutual counts over the pool, so the shown badge always
//      matches the mutual-friends tab.

// (a) Parameters: $id
MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User)
RETURN f.id AS id

// (b) Parameters: $userId, $friendLimit, $friendIds, $poolLimit
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

// (c) Parameters: $userId, $candidateIds
MATCH (me:User {id: $userId})-[:FRIENDS_WITH]->(m:User)<-[:FRIENDS_WITH]-(candidate:User)
WHERE candidate.id IN $candidateIds
RETURN candidate.id AS id, count(m) AS mutualCount

// The route merges (b)+(c), sorts by mutualCount DESC, degree DESC, id ASC,
// and returns the top $limit. Ideal single-statement form (reference) —
// requires a planner that supports pattern-predicate negation and can
// afford the full expansion:

MATCH (me:User {id: $userId})-[:FRIENDS_WITH]->(friend:User)-[:FRIENDS_WITH]->(candidate:User)
WHERE candidate <> me
  AND NOT (me)-[:FRIENDS_WITH]->(candidate)
WITH candidate, count(DISTINCT friend) AS mutualCount
RETURN candidate, mutualCount
ORDER BY mutualCount DESC, candidate.degree DESC, candidate.id ASC
LIMIT $limit

// ── 2. Direct friends of a user ──────────────────────────────────────
// Parameters: $id, $limit

MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User)
RETURN f
ORDER BY f.degree DESC, f.id ASC
LIMIT $limit

// ── 3. Single-user lookup ────────────────────────────────────────────
// Parameters: $id

MATCH (u:User {id: $id})
RETURN u

// ── 4. Search (name substring + id prefix) ───────────────────────────
// Parameters: $q, $limit

MATCH (u:User)
WHERE toLower(u.name) CONTAINS toLower($q)
   OR toString(u.id) STARTS WITH $q
RETURN u
ORDER BY u.degree DESC, u.id ASC
LIMIT $limit

// ── 5. Mutual friends between two users ──────────────────────────────
// A relationship database needs self-joins on the adjacency table;
// here it's a single pattern. Parameters: $idA, $idB

MATCH (a:User {id: $idA})-[:FRIENDS_WITH]->(m:User)<-[:FRIENDS_WITH]-(b:User {id: $idB})
RETURN m
ORDER BY m.degree DESC, m.id ASC

// ── 6. Degrees of separation (shortest path) ─────────────────────────
// CognoDB's `shortestPath` carries a hard BFS budget (5 s) that this graph
// exhausts on the free tier, so the production code (src/path.js) runs a
// bidirectional BFS from the application, expanding one hop per query:
//
//   expand a frontier (one hop)          Parameters: $ids
MATCH (u:User) WHERE u.id IN $ids
MATCH (u)-[:FRIENDS_WITH]->(f:User)
RETURN u.id AS uid, collect(f) AS friends

//   materialise a found path             Parameters: $ids
MATCH (u:User) WHERE u.id IN $ids
RETURN u

// The ideal declarative form — variable-length BFS up to 8 hops. In SQL
// this is a recursive CTE with an explicit termination condition. Keep it
// for databases whose planner handles it; see src/path.js for why this
// app drives the search hop-by-hop instead. Parameters: $idA, $idB

MATCH p = shortestPath((a:User {id: $idA})-[:FRIENDS_WITH*..8]-(b:User {id: $idB}))
RETURN nodes(p) AS path

// ── 7. Network stats ─────────────────────────────────────────────────

MATCH (u:User) RETURN count(u) AS users
MATCH ()-[:FRIENDS_WITH]->() RETURN count(*) AS friendships   // ÷ 2 = real friendships
MATCH (u:User) RETURN avg(u.degree) AS avgDegree, max(u.degree) AS maxDegree

// ── 8. Most-connected users ──────────────────────────────────────────
// Parameters: $limit

MATCH (u:User)
RETURN u
ORDER BY u.degree DESC, u.id ASC
LIMIT $limit

// ─────────────────────────────────────────────────────────────────────
// Seed-time statements (scripts/seed.js) — all parameterised via UNWIND
// ─────────────────────────────────────────────────────────────────────

// Indexes (idempotent)
CREATE INDEX user_id IF NOT EXISTS FOR (u:User) ON (u.id)
CREATE INDEX user_name IF NOT EXISTS FOR (u:User) ON (u.name)

// Users — one statement, $users is an array of profile maps
UNWIND $users AS u
MERGE (user:User {id: u.id})
SET user.name = u.name,
    user.city = u.city,
    user.job = u.job,
    user.age = u.age,
    user.interests = u.interests,
    user.degree = u.degree

// Edges — $batch is an array of [fromId, toId] pairs; stored both ways
UNWIND $batch AS e
MATCH (a:User {id: e[0]}), (b:User {id: e[1]})
MERGE (a)-[:FRIENDS_WITH]->(b)
MERGE (b)-[:FRIENDS_WITH]->(a)
