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
// 2-hop traversal: me → friend → candidate.
// Candidates who are already my friends (or myself) are excluded.
// Ranked by count of DISTINCT mutual friends, then by candidate degree.
// Parameters: $userId, $limit

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
// Variable-length BFS up to 8 hops. In SQL this is a recursive CTE
// with an explicit termination condition. Parameters: $idA, $idB

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
