import json
import uuid
from pathlib import Path

from app.domain.assignment import assignment_buckets


def test_assignment_hashing_matches_golden_vectors() -> None:
    vectors = json.loads(
        (Path(__file__).parents[2] / "contracts/assignment-golden-vectors.json").read_text()
    )
    for vector in vectors:
        buckets = assignment_buckets(
            salt=vector["salt"],
            identity_namespace=vector["identity_namespace"],
            experiment_id=uuid.UUID(vector["experiment_id"]),
            configuration_version_id=uuid.UUID(vector["configuration_version_id"]),
            subject_id=vector["subject_id"],
        )
        assert buckets.traffic_bucket == vector["traffic_bucket"]
        assert buckets.arm_bucket == vector["arm_bucket"]


def test_traffic_and_arm_hash_domains_are_independent() -> None:
    experiment_id = uuid.uuid4()
    configuration_id = uuid.uuid4()
    results = [
        assignment_buckets(
            salt="distribution-test-salt",
            identity_namespace="subject",
            experiment_id=experiment_id,
            configuration_version_id=configuration_id,
            subject_id=f"person-{index}",
        )
        for index in range(4_000)
    ]
    traffic_half = sum(item.traffic_bucket < 5_000 for item in results) / len(results)
    arm_half = sum(item.arm_bucket < 5_000 for item in results) / len(results)
    same_side = sum(
        (item.traffic_bucket < 5_000) == (item.arm_bucket < 5_000) for item in results
    ) / len(results)
    assert 0.47 < traffic_half < 0.53
    assert 0.47 < arm_half < 0.53
    assert 0.47 < same_side < 0.53
