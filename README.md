# Six Degrees — a friend-of-friend recommender

A graph database application built for the **WEXA AI / CognoDB take-home assignment**.
It answers one question, the way social networks actually do:

> **“Friends of my friends, who aren't already my friends — ranked by how many mutual friends we share.”**

A 2-hop traversal over the friendship graph, powered by **CognoDB** (openCypher over Bolt, using the
official Neo4j Python driver), served by a **FastAPI** backend with a polished web UI and a realistic
seed dataset.

---

### Live link : https://congodb-assignment.onrender.com/

---

## Use case

Social platforms suggest new connections via *“People you may know”*. Under the hood that's a pure
graph question: walk from me to my friends to *their* friends (2 hops), drop anyone I'm already
friends with, and rank the rest by how many shared friends we have. The more mutual friends, the
stronger the signal — exactly how LinkedIn and Facebook surface suggestions.

Six Degrees makes that visible and explorable:

- **Search** any of 4,000+ people in the network.
- See **personalised suggestions** ranked by mutual-friend count.
- Explore someone's **friends**, the **mutual friends** you share with them, and the
  **shortest path (degrees of separation)** between any two people.

### Why a graph database?

This problem is *about relationships*, so a graph earns its place in three concrete ways:

1. **Multi-hop traversal is native.** “Friends of friends” is one pattern:
   `(me)-[:FRIENDS_WITH]->(friend)-[:FRIENDS_WITH]->(candidate)`. In a relational schema you'd
   self-join the `friendships` adjacency table *twice*, then join again to exclude direct friends —
   and each extra hop means another self-join. Here, adding a 3rd hop is just one more
   `-[:FRIENDS_WITH]->()` in the pattern.

2. **The ranking signal is a graph aggregate.** “Count of distinct mutual friends” is a
   `count(DISTINCT friend)` over the traversal. In SQL this is a group-by over joined rows that
   grows quadratically with network size and needs careful deduplication.

3. **Shortest path / degrees of separation is a first-class query.** `shortestPath((a)-[*..8]-(b))`
   is a built-in BFS. In SQL it requires a recursive CTE with hand-rolled termination conditions
   and cycle detection. The graph does it declaratively.

A relational database *can* express all of this, but every query fights the model — which is the
whole point of this use case: the interesting questions are about *connections*, not rows.

---

## Data model

```
┌──────────┐      FRIENDS_WITH       ┌──────────┐
│  :User   │ ══════════════════════► │  :User   │
│          │ ◄══════════════════════ │          │
└──────────┘   (stored both ways)    └──────────┘
   │ id (int, indexed)
   │ name (string)
   │ city, job (string)
   │ age (int)
   │ interests (list<string>)
   │ degree (int — precomputed connection count)
```

- **Nodes:** `User` — a person in the social network.
- **Relationships:** `FRIENDS_WITH` — an undirected friendship, stored as two directed edges so
  every query uses plain `→` patterns.
- **Properties:** `id` is the dataset's anonymised id; the human-facing profile fields (name, city,
  job, age, interests) are generated deterministically from the id (see *Dataset* below).
- **Indexes:** on `User.id` and `User.name` for fast lookups and search.

The schema is deliberately minimal — the assignment's “dead simple” core — and it is trivially
extensible to richer *“people you may know”* signals later: add an `interests`-based `LIKES`
relationship, or an `(a)-[:FRIENDS_WITH]->(b)-[:LIKES]->(i)<-[:LIKES]-(c)` path for shared-interest
ranking, without touching existing queries.

---

## Dataset

**[SNAP ego-Facebook network](https://snap.stanford.edu/data/facebook_combined.html)** (Stanford
Network Analysis Project) — the classic undirected friendship graph used in social-network research:

- **4,039 users, 88,234 friendships**
- Free, no sign-up, ~218 KB gzipped — fits the CognoDB free tier easily
- License: freely available for research use (see the SNAP page)

The dataset is anonymised (nodes are just integer ids), so the seed script attaches a **stable,
deterministic profile** to every id — a realistic name, city, job, age and interests — making the
app feel like a real product. Re-seeding produces identical profiles.

`python scripts/seed.py` downloads the dataset automatically if it isn't already in `data/` (the raw
edge list is committed to the repo, so seeding works fully offline).

---

## Architecture

```
Browser (vanilla JS, no build step)
   │  fetch /api/*
   ▼
FastAPI (uvicorn) ──── main.py
   ├── app/routers/meta.py   health · stats · top users
   ├── app/routers/users.py  search · profile · friends · recommendations · mutual · path
   ├── app/queries.py        all Cypher, as named constants (parameterised only)
   ├── app/path.py           app-side bidirectional BFS for degrees of separation
   ├── app/db.py             async neo4j-driver wrapper (session mgmt, health)
   └── app/config.py         env-based config (.env, gitignored)
   │
   ▼  Bolt protocol (openCypher)
CognoDB (or local Neo4j via docker-compose)
```

```
main.py           FastAPI app: routers, error handlers, static frontend mount
app/              config · db wrapper · queries · path BFS · routers
public/           frontend (index.html, styles.css, app.js) — hash-router SPA
scripts/          seed.py (loader) · dataset.py (download/parse) · profiles.py (deterministic)
                  smoke.py (exercises every headline query)
cypher/           queries.cypher — human-readable query reference
data/             committed edge list (facebook_combined.txt)
Dockerfile        container image for the app (reads $PORT at runtime)
docker-compose.yml  local stack: Neo4j + the app in one command
requirements.txt  fastapi · uvicorn · neo4j · python-dotenv
```

---

## Setup

###  Prerequisites

- A database speaking openCypher over Bolt: **CognoDB Cloud** (the submission target) or local
  Neo4j for development.

###  Local development — Docker Neo4j

The app talks to any Bolt database, so you can develop against local Neo4j first:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

docker compose up -d neo4j       # starts neo4j:5.26-community on bolt://localhost:7687
python scripts/seed.py           # loads 4,039 users + 88,234 friendships (~8 s)
python -m uvicorn main:app --reload --port 3000
```

This mirrors CognoDB exactly — same protocol, same driver, same queries.

#### No Python installed? Run the whole stack in Docker instead

```bash
docker compose up -d --build     # builds the image, starts Neo4j + the app
# http://localhost:3000 — then load the dataset:
docker compose run --rm app python scripts/seed.py
```

The `app` service builds from the `Dockerfile` and is wired to the local Neo4j
service automatically.

### 2. Point it at CognoDB Cloud (the assignment target)

1. Create a free instance at <https://console.cognodb.com> (no credit card, ~1 minute).
2. Copy the connection URI (`bolt+s://<instance-id>.databases.cognodb.cloud`) and the
   one-time password for user `cognodb`.
3. Configure the app:

```bash
cp .env.example .env
# edit .env:
#   NEO4J_URI=bolt+s://<instance-id>.databases.cognodb.cloud
#   NEO4J_USER=cognodb
#   NEO4J_PASSWORD=<your-password>
```

4. Load data and run:

```bash
python scripts/seed.py --fresh   # loads into CognoDB
python -m uvicorn main:app --port 3000
```

---

## The queries

All queries are **parameterised** through the official `neo4j-driver` — user input only ever arrives
via `$params`, never by string concatenation. See `cypher/queries.cypher` for the full reference.

### 1. Recommendations (the core 2-hop query)

Walks `me → friend → candidate` (2 hops), drops me and my direct friends, counts the distinct
mutual friends per candidate, and ranks. Result: *“Quinn Singh — 4 mutual friends”*. On CognoDB
this is composed from three small, bounded statements (see `app/routers/users.py`):

```cypher
MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User)
RETURN f.id AS id

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

MATCH (me:User {id: $userId})-[:FRIENDS_WITH]->(m:User)<-[:FRIENDS_WITH]-(candidate:User)
WHERE candidate.id IN $candidateIds
RETURN candidate.id AS id, count(m) AS mutualCount
```

Three deliberate choices, each verified against CognoDB specifically:

1. **Exclusion by id list.** `NOT candidate.id IN $friendIds` replaces the textbook
   `NOT (me)-[:FRIENDS_WITH]->(candidate)` pattern predicate, which CognoDB evaluates to **zero
   rows** — a silent bug that made recommendations come back empty.
2. **Bounded walk.** The 2-hop expansion goes through the user's top `$friendLimit` friends
   (most-connected first), keeping the statement inside the server's query deadline even for
   1,000-friend hubs. Most-connected friends carry most of the signal; for typical users the
   limit never binds.
3. **Exact counts.** Mutual counts are computed in a separate bounded query over the candidate
   pool, so a suggestion's badge always matches its real shared-friend count.

The ideal single-statement form (which needs a planner that supports pattern-predicate negation
and can afford the full expansion) is documented in `cypher/queries.cypher`.

### 2. Degrees of separation (shortest path)

CognoDB's `shortestPath` has a hard 5 s BFS budget that this graph exhausts on the free tier
(an 8-hop `shortestPath` times out even for directly connected people), so the app drives the
search itself in [`app/path.py`](app/path.py): a **bidirectional BFS**, one hop per query —
`MATCH (u:User) WHERE u.id IN $ids ... RETURN collect(f)` — meeting in the middle, capped at
8 hops. Every statement stays small and index-backed, so the whole search stays well inside the
query deadline. Result: *“Chloe Nguyen → Elena Lee → Liam Yamamoto: 2 degrees”*.

### 3. Mutual friends

```cypher
MATCH (a:User {id: $idA})-[:FRIENDS_WITH]->(m:User)<-[:FRIENDS_WITH]-(b:User {id: $idB})
RETURN m
```

### 4. Search & friends

```cypher
MATCH (u:User) WHERE toLower(u.name) CONTAINS toLower($q) OR toString(u.id) STARTS WITH $q
RETURN u ORDER BY u.degree DESC LIMIT $limit

MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User) RETURN f ORDER BY f.degree DESC LIMIT $limit
```

### 5. Seed loading (batch, parameterised)

```cypher
UNWIND $batch AS e
MATCH (a:User {id: e[0]}), (b:User {id: e[1]})
MERGE (a)-[:FRIENDS_WITH]->(b)
MERGE (b)-[:FRIENDS_WITH]->(a)
```

---

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | DB connectivity (`200` / `503`) |
| `GET /api/stats` | users, friendships, avg/max degree |
| `GET /api/top?limit=` | most-connected people |
| `GET /api/users/search?q=&limit=` | name/id search |
| `GET /api/users/:id` | profile |
| `GET /api/users/:id/friends` | direct friends |
| `GET /api/users/:id/recommendations` | **friend-of-friend suggestions, ranked** |
| `GET /api/users/:id/mutual/:otherId` | shared friends |
| `GET /api/users/:id/path/:otherId` | shortest path (degrees of separation) |

---
