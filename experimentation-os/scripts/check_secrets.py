import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {
    ".git",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".terraform",
    ".venv",
    "node_modules",
    "dist",
}
SKIP_FILES = {
    Path(__file__).resolve(),
    ROOT / "pnpm-lock.yaml",
    ROOT / "backend" / "uv.lock",
}
PATTERNS = {
    "AWS access key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "live service credential": re.compile(r"eos_[0-9a-f]{32}\.[A-Za-z0-9_-]{30,}"),
}
BROWSER_FORBIDDEN = {
    "database URL setting": re.compile(r"DATABASE_URL"),
    "credential pepper setting": re.compile(r"CREDENTIAL_PEPPER"),
    "OIDC secret setting": re.compile(r"OIDC_(?:CLIENT_)?SECRET"),
    "PostgreSQL password setting": re.compile(r"POSTGRES_PASSWORD"),
    "live service credential": PATTERNS["live service credential"],
}


findings: list[str] = []
for directory, names, filenames in os.walk(ROOT):
    names[:] = [name for name in names if name not in SKIP_PARTS]
    for filename in filenames:
        path = Path(directory, filename)
        if path.resolve() in SKIP_FILES or path.stat().st_size > 5_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in PATTERNS.items():
            if pattern.search(content):
                findings.append(f"{path.relative_to(ROOT)}: possible {label}")

if findings:
    print("\n".join(findings), file=sys.stderr)
    raise SystemExit(1)

bundle_roots = [
    ROOT / "frontend" / ".next" / "static",
    ROOT / "examples" / "host-app" / ".next" / "static",
]
bundle_findings: list[str] = []
bundle_files = 0
for bundle_root in bundle_roots:
    if not bundle_root.exists():
        continue
    for path in bundle_root.rglob("*"):
        if not path.is_file() or path.stat().st_size > 5_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        bundle_files += 1
        for label, pattern in BROWSER_FORBIDDEN.items():
            if pattern.search(content):
                bundle_findings.append(f"{path.relative_to(ROOT)}: browser bundle contains {label}")

if bundle_findings:
    print("\n".join(bundle_findings), file=sys.stderr)
    raise SystemExit(1)

print(
    "No credential-shaped secrets found in repository text files; "
    f"checked {bundle_files} generated browser bundle files."
)
