import 'dotenv/config'

/**
 * Central configuration. All secrets come from environment variables
 * (a local `.env` file, gitignored) — never from the repository.
 */
export const config = {
  /** CognoDB / Neo4j connection, e.g. bolt+s://<instance-id>.databases.cognodb.cloud */
  neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  /** CognoDB always uses the user "cognodb"; local Neo4j uses "neo4j". */
  neo4jUser: process.env.NEO4J_USER || 'neo4j',
  neo4jPassword: process.env.NEO4J_PASSWORD || '',
  /** HTTP port for the web app. */
  port: parseInt(process.env.PORT || '3000', 10),
}
