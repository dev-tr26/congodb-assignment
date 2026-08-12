"""Six Degrees — FastAPI backend.

Run with:  uvicorn main:app --host 0.0.0.0 --port $PORT
The frontend in public/ is served as static files; the API lives under /api.
"""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from neo4j.exceptions import Neo4jError

from app.errors import ApiError, classify_database_error
from app.routers import meta, users

PUBLIC_DIR = Path(__file__).resolve().parent / "public"

app = FastAPI(title="Six Degrees", docs_url=None, redoc_url=None, openapi_url=None)

app.include_router(meta.router, prefix="/api")
app.include_router(users.router, prefix="/api/users")


# ── error handlers ──────────────────────────────────────────────────────
# Keep the app alive and return friendly JSON in the same shapes the
# frontend understands (matching the old Express middleware).

@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error, "message": exc.message, "detail": exc.detail},
    )


@app.exception_handler(Neo4jError)
async def neo4j_error_handler(request: Request, exc: Neo4jError):
    status, error, message = classify_database_error(str(exc))
    return JSONResponse(
        status_code=status,
        content={"error": error, "message": message, "detail": str(exc)},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    status, error, message = classify_database_error(str(exc))
    return JSONResponse(
        status_code=status,
        content={"error": error, "message": message, "detail": str(exc)},
    )


# ── unknown API route ───────────────────────────────────────────────────
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def api_not_found(path: str):
    return JSONResponse(
        status_code=404,
        content={"error": "not-found", "message": "Unknown API route."},
    )


# ── static frontend (mounted last so /api routes win) ───────────────────
app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="static")
