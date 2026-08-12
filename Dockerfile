# Six Degrees — FastAPI backend
# Build:   docker build -t six-degrees .
# Run:     docker run --rm -p 3000:3000 --env-file .env six-degrees

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first, so rebuilds reuse the cached layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code and static frontend.
COPY main.py .
COPY app/ app/
COPY public/ public/
COPY scripts/ scripts/
COPY cypher/ cypher/
COPY data/ data/

# The port the app listens on. This line is documentation only — Docker does
# not route traffic to it. On Render the platform injects $PORT at runtime and
# the app MUST bind to that value (see CMD); locally it defaults to 3000.
EXPOSE 3000

# Shell form so Render's $PORT (injected at runtime) is honoured.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-3000}"]
