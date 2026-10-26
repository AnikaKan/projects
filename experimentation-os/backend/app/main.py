from fastapi import FastAPI

from app.api.routes import router
from app.config import Settings
from app.db.session import create_database_engine, create_session_factory


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or Settings()
    app = FastAPI(
        title="ExperimentOS API",
        version="0.1.0",
        description="Day 1 management, identity, scope, and credential boundary.",
    )
    app.state.settings = active_settings
    app.state.engine = create_database_engine(active_settings.database_url)
    app.state.session_factory = create_session_factory(app.state.engine)
    app.include_router(router)
    return app
