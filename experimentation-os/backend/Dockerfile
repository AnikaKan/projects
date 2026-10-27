FROM ghcr.io/astral-sh/uv:0.11.7 AS uv
FROM python:3.13.12-slim AS application

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY --from=uv /uv /usr/local/bin/uv
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/alembic.ini ./alembic.ini
COPY backend/migrations ./migrations
COPY backend/app ./app

RUN addgroup --system experimentos && adduser --system --ingroup experimentos experimentos \
    && chown -R experimentos:experimentos /app
USER experimentos

EXPOSE 8000
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

FROM application AS test

USER root
RUN uv sync --frozen
COPY backend/tests ./tests
COPY contracts /contracts
COPY scripts ./scripts
RUN chown -R experimentos:experimentos /app
USER experimentos
CMD ["pytest"]

FROM application AS runtime
