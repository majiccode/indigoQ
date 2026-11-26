FROM node:22-bookworm-slim AS frontend
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /src/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN INDIGOQ_STATIC_EXPORT=1 NEXT_PUBLIC_API_URL= pnpm build

FROM ghcr.io/astral-sh/uv:0.11.8 AS uv
FROM python:3.13-slim-bookworm
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-editable
COPY backend/app ./app
COPY backend/launcher.py ./launcher.py
COPY --from=frontend /src/frontend/out /app/frontend/out
RUN useradd --create-home --uid 10001 indigoq && mkdir /data && chown indigoq:indigoq /data
USER indigoq
ENV INDIGOQ_DATA_FILE=/data/graph.json INDIGOQ_STATIC_DIR=/app/frontend/out PYTHONUNBUFFERED=1
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD ["/app/backend/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/api/health', timeout=3)"]
ENTRYPOINT ["/app/backend/.venv/bin/python", "launcher.py", "--host", "0.0.0.0", "--no-browser"]
