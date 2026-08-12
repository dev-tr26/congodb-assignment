"""API error handling shared by the routers."""

import re


class ApiError(Exception):
    """A controlled HTTP error with a JSON body matching the frontend."""

    def __init__(self, status_code, error, message, detail=None):
        super().__init__(message)
        self.status_code = status_code
        self.error = error
        self.message = message
        self.detail = detail


def classify_database_error(message):
    """Map a database failure message to (status, error, friendly message).

    Mirrors the old Express error middleware:
      - connectivity/auth problems → 503 database-unreachable
      - CognoDB killing a slow statement ("context deadline exceeded") → 504 query-timeout
      - anything else → 500 internal
    """
    if re.search(
        r"connect|connection refused|auth|authentication|unavailable|unreachable|invalid credential",
        message,
        re.IGNORECASE,
    ):
        return (
            503,
            "database-unreachable",
            "Could not reach the graph database. Check that your instance is running and your .env credentials are correct.",
        )
    if re.search(r"timeout|deadline exceeded", message, re.IGNORECASE):
        return (
            504,
            "query-timeout",
            "The database took too long to answer that query. Try a less connected person, or retry.",
        )
    return (500, "internal", "Something went wrong while processing your request.")
