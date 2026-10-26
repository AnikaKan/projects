import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.config import AuthMode, RuntimeEnvironment, Settings  # noqa: E402
from app.main import create_app  # noqa: E402

settings = Settings(
    EXPERIMENTOS_ENVIRONMENT=RuntimeEnvironment.TEST,
    AUTH_MODE=AuthMode.LOCAL,
    DATABASE_URL="sqlite+pysqlite:///:memory:",
    CREDENTIAL_PEPPER="openapi-generation-only-pepper-000000000",
)
schema = create_app(settings).openapi()
(BACKEND / "openapi.json").write_text(
    json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8"
)
