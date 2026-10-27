import asyncio

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.analysis import router as analysis_router
from app.api.assignments import router as assignment_router
from app.api.events import router as event_router
from app.api.experiments import router as experiment_router
from app.api.operations import router as operations_router
from app.api.quality import router as quality_router
from app.api.routes import router
from app.config import RuntimeEnvironment, Settings
from app.db.session import create_database_engine, create_session_factory
from app.event_queue import create_event_queue
from app.observability import OperationalMetrics


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or Settings()
    app = FastAPI(
        title="ExperimentOS API",
        version="0.1.0",
        description="ExperimentOS lifecycle, assignment, identity, and durable event boundary.",
    )
    app.state.settings = active_settings
    app.state.engine = create_database_engine(active_settings.database_url)
    app.state.session_factory = create_session_factory(app.state.engine)
    app.state.event_queue = create_event_queue(active_settings)
    app.state.operational_metrics = OperationalMetrics(
        concurrency_limit=active_settings.request_concurrency_limit
    )

    @app.middleware("http")
    async def bounded_request_metrics(request: Request, call_next):  # type: ignore[no-untyped-def]
        permit = app.state.operational_metrics.begin()
        if permit is None:
            return JSONResponse(
                status_code=503,
                content={"detail": "request concurrency limit reached"},
                headers={"Retry-After": "1"},
            )
        status_code = 500
        try:
            delay = request.headers.get("X-Local-Fault-Delay-Ms")
            if delay and active_settings.environment in {
                RuntimeEnvironment.LOCAL,
                RuntimeEnvironment.TEST,
            }:
                try:
                    requested_delay = int(delay)
                except ValueError:
                    requested_delay = 0
                await asyncio.sleep(min(max(requested_delay, 0), 2_000) / 1_000)
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            app.state.operational_metrics.finish(permit, status_code)

    app.include_router(router)
    app.include_router(experiment_router)
    app.include_router(assignment_router)
    app.include_router(event_router)
    app.include_router(quality_router)
    app.include_router(analysis_router)
    app.include_router(operations_router)
    return app
