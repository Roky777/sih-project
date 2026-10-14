FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_NO_CACHE=1 \
    UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"
WORKDIR /app
RUN python -m pip install --no-cache-dir uv==0.12.23
COPY pyproject.toml uv.lock ./

FROM base AS runtime-dependencies
RUN uv sync --locked --extra science --no-dev --no-install-project

FROM runtime-dependencies AS runtime
COPY src ./src
RUN uv sync --locked --extra science --no-dev
COPY alembic.ini ./
COPY migrations ./migrations
# Dependencies are read-only at runtime. Chown only writable artifacts; recursively
# changing /app duplicates the full scientific environment in every rebuild layer.
RUN useradd --uid 10001 --create-home fleet && \
    mkdir -p /var/lib/fleet-maintenance/artifacts && \
    chown -R fleet:fleet /var/lib/fleet-maintenance
USER fleet
EXPOSE 8000

FROM base AS test-dependencies
RUN uv sync --locked --extra science --extra dev --no-install-project

FROM test-dependencies AS test
COPY src ./src
COPY tests ./tests
RUN uv sync --locked --extra science --extra dev
CMD ["python", "-m", "pytest"]

FROM test AS science

FROM test AS sequence
RUN uv pip install "torch==2.8.0" --index-url https://download.pytorch.org/whl/cpu
