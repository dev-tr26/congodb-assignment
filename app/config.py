import os

from dotenv import load_dotenv

# All secrets come from environment variables (a local .env file, gitignored)
# — never from the repository.
load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")

# HTTP port for the web app (Render sets PORT; defaults to 3000 locally).
PORT = int(os.getenv("PORT", "3000"))
