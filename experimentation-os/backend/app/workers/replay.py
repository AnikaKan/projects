from __future__ import annotations

import argparse
import uuid

from sqlalchemy.orm import Session

from app.config import Settings
from app.db.session import create_database_engine
from app.domain.events import replay_raw_events


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a new, isolated event-contribution derivation from retained raw events."
    )
    parser.add_argument("--environment-id", required=True, type=uuid.UUID)
    parser.add_argument("--derivation-version", required=True)
    args = parser.parse_args()
    settings = Settings()
    engine = create_database_engine(settings.database_url)
    with Session(engine) as session:
        count = replay_raw_events(
            session,
            environment_id=args.environment_id,
            derivation_version=args.derivation_version,
        )
    print(f"created {count} isolated contributions for {args.derivation_version}")


if __name__ == "__main__":
    main()
