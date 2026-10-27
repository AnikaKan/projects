"""Derive an immutable Day 4 cohort/quality snapshot for one experiment."""

from __future__ import annotations

import argparse
import uuid

from sqlalchemy.orm import Session

from app.config import Settings
from app.db.session import create_database_engine
from app.domain.cohorts import derive_cohort_snapshot


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiment-id", required=True, type=uuid.UUID)
    parser.add_argument("--derivation-version", default="cohort-v1")
    parser.add_argument("--event-derivation-version", default="events-v1")
    arguments = parser.parse_args()
    engine = create_database_engine(Settings().database_url)
    with Session(engine) as session:
        result = derive_cohort_snapshot(
            session,
            experiment_id=arguments.experiment_id,
            derivation_version=arguments.derivation_version,
            event_derivation_version=arguments.event_derivation_version,
        )
    engine.dispose()
    print(
        "cohort snapshot "
        f"{result.snapshot.id} created={result.created} "
        f"finalization_ready={result.snapshot.finalization_ready}"
    )


if __name__ == "__main__":
    main()
