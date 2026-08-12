/**
 * All Cypher queries used by the application.
 *
 * Every query is parameterised — user input is only ever passed through
 * `$params`, never concatenated into the query string.
 *
 * The same queries are documented for humans in `cypher/queries.cypher`;
 * keep the two files in sync.
 */

/** Core feature: friends-of-friends who are not already friends, ranked by mutual friend count. */
export const RECOMMENDATIONS = `
MATCH (me:User {id: $userId})-[:FRIENDS_WITH]->(friend:User)-[:FRIENDS_WITH]->(candidate:User)
WHERE candidate <> me
  AND NOT (me)-[:FRIENDS_WITH]->(candidate)
WITH candidate, count(DISTINCT friend) AS mutualCount
RETURN candidate, mutualCount
ORDER BY mutualCount DESC, candidate.degree DESC, candidate.id ASC
LIMIT $limit
`

/** A user's direct friends, most-connected first. */
export const FRIENDS = `
MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User)
RETURN f
ORDER BY f.degree DESC, f.id ASC
LIMIT $limit
`

/** Fetch a single user by id. */
export const USER_PROFILE = `
MATCH (u:User {id: $id})
RETURN u
`

/** Case-insensitive name search plus numeric id prefix search. */
export const SEARCH = `
MATCH (u:User)
WHERE toLower(u.name) CONTAINS toLower($q)
   OR toString(u.id) STARTS WITH $q
RETURN u
ORDER BY u.degree DESC, u.id ASC
LIMIT $limit
`

/** Mutual friends shared by two users (the "how do you know them" query). */
export const MUTUAL_FRIENDS = `
MATCH (a:User {id: $idA})-[:FRIENDS_WITH]->(m:User)<-[:FRIENDS_WITH]-(b:User {id: $idB})
RETURN m
ORDER BY m.degree DESC, m.id ASC
`

/** Shortest path between two users — degrees of separation (multi-hop BFS). */
export const SHORTEST_PATH = `
MATCH p = shortestPath((a:User {id: $idA})-[:FRIENDS_WITH*..8]-(b:User {id: $idB}))
RETURN nodes(p) AS path
`

/** Graph stats. */
export const STATS_USERS = `MATCH (u:User) RETURN count(u) AS users`
export const STATS_FRIENDSHIPS = `MATCH ()-[:FRIENDS_WITH]->() RETURN count(*) AS friendships`
export const STATS_DEGREES = `MATCH (u:User) RETURN avg(u.degree) AS avgDegree, max(u.degree) AS maxDegree`

/** Most-connected users, for the home page. */
export const TOP_USERS = `
MATCH (u:User)
RETURN u
ORDER BY u.degree DESC, u.id ASC
LIMIT $limit
`

/* ── Seed-time queries (used by scripts/seed.js) ─────────────────────── */

export const DROP_ALL = `MATCH (n) DETACH DELETE n`

export const CREATE_INDEX_USER_ID = `CREATE INDEX user_id IF NOT EXISTS FOR (u:User) ON (u.id)`
export const CREATE_INDEX_USER_NAME = `CREATE INDEX user_name IF NOT EXISTS FOR (u:User) ON (u.name)`

export const UPSERT_USERS = `
UNWIND $users AS u
MERGE (user:User {id: u.id})
SET user.name = u.name,
    user.city = u.city,
    user.job = u.job,
    user.age = u.age,
    user.interests = u.interests,
    user.degree = u.degree
`

export const UPSERT_EDGES = `
UNWIND $batch AS e
MATCH (a:User {id: e[0]}), (b:User {id: e[1]})
MERGE (a)-[:FRIENDS_WITH]->(b)
MERGE (b)-[:FRIENDS_WITH]->(a)
`

export const COUNT_USERS = `MATCH (u:User) RETURN count(u) AS n`
export const COUNT_EDGES = `MATCH ()-[:FRIENDS_WITH]->() RETURN count(*) AS n`
