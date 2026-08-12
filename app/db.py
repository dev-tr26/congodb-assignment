"""
Thin wrapper around the official Neo4j Python driver (async). CognoDB
speaks the same openCypher-over-Bolt protocol, so the stock driver works
unchanged. The driver is created lazily and reused for the process
lifetime.
"""
import neo4j

from . import config

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        _driver = neo4j.AsyncGraphDatabase.driver(
            config.NEO4J_URI,
            auth=(config.NEO4J_USER, config.NEO4J_PASSWORD),
            max_connection_pool_size=50,
            # Fail fast instead of hanging forever when the DB is unreachable.
            connection_timeout=10,
        )
    return _driver


async def run_query(cypher, params=None):
    """Run a parameterised Cypher query and return the rows as dicts."""
    params = params or {}
    async with get_driver().session() as session:
        result = await session.run(cypher, params)
        return await result.data()


async def close_driver():
    """Close the driver (lets CLI scripts exit cleanly)."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


async def check_health():
    """Lightweight connectivity check used by /api/health and the UI banner."""
    try:
        await get_driver().verify_connectivity()
        return {"ok": True, "error": None}
    except Exception as err:  # noqa: BLE001 — surface any connectivity failure
        return {"ok": False, "error": str(err)}


def to_number(value):
    """Convert a Cypher integer (or plain number) to a Python number safely."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    return int(value)
