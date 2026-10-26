import json
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
PYTHON = BACKEND / ".venv" / "bin" / "python"
BASE_URL = "http://127.0.0.1:8125"
STARTUP_TIMEOUT_SECONDS = float(os.environ.get("EXPERIMENTOS_SMOKE_TIMEOUT_SECONDS", "30"))

environment = os.environ.copy()
environment.update(
    {
        "EXPERIMENTOS_ENVIRONMENT": "test",
        "AUTH_MODE": "local",
        "CREDENTIAL_PEPPER": "runtime-test-pepper-0000000000000000",
    }
)
runtime_database_path: Path | None = None
if not environment.get("DATABASE_URL"):
    runtime_database_path = (
        Path(tempfile.gettempdir()) / f"experimentos-runtime-{os.getpid()}.sqlite3"
    )
    environment["DATABASE_URL"] = f"sqlite+pysqlite:///{runtime_database_path}"

process = subprocess.Popen(  # noqa: S603 -- executable is the repository's fixed virtualenv path
    [
        str(PYTHON),
        "-m",
        "uvicorn",
        "app.main:create_app",
        "--factory",
        "--host",
        "127.0.0.1",
        "--port",
        "8125",
    ],
    cwd=BACKEND,
    env=environment,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)

try:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(  # noqa: S310 -- URL is a fixed loopback HTTP endpoint
                f"{BASE_URL}/health/live", timeout=1
            ) as response:
                live = json.load(response)
            break
        except (OSError, urllib.error.URLError):
            if process.poll() is not None:
                output = process.stdout.read() if process.stdout else ""
                raise RuntimeError(f"API exited during startup:\n{output}") from None
            time.sleep(0.1)
    else:
        raise RuntimeError(
            f"API did not become reachable within {STARTUP_TIMEOUT_SECONDS:g} seconds"
        )

    with urllib.request.urlopen(  # noqa: S310 -- URL is a fixed loopback HTTP endpoint
        f"{BASE_URL}/health/ready", timeout=1
    ) as response:
        ready = json.load(response)
    try:
        urllib.request.urlopen(  # noqa: S310 -- URL is a fixed loopback HTTP endpoint
            f"{BASE_URL}/v1/me", timeout=1
        )
    except urllib.error.HTTPError as error:
        unauthorized_status = error.code
    else:
        unauthorized_status = 200

    if unauthorized_status != 401:
        raise RuntimeError(
            f"expected unauthenticated /v1/me to return 401, got {unauthorized_status}"
        )
    print(json.dumps({"live": live, "ready": ready, "unauthenticated_me": unauthorized_status}))
finally:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    if runtime_database_path is not None:
        runtime_database_path.unlink(missing_ok=True)
