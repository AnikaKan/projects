import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignmentBucket } from "../src/hashing";

interface Vector {
  salt: string;
  identity_namespace: string;
  experiment_id: string;
  configuration_version_id: string;
  subject_id: string;
  traffic_bucket: number;
  arm_bucket: number;
}

describe("assignment hashing contract", () => {
  it("matches the language-independent golden vectors", () => {
    const vectors = JSON.parse(
      readFileSync(
        new URL(
          "../../../contracts/assignment-golden-vectors.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Vector[];
    for (const vector of vectors) {
      const common = {
        salt: vector.salt,
        identityNamespace: vector.identity_namespace,
        experimentId: vector.experiment_id,
        configurationVersionId: vector.configuration_version_id,
        subjectId: vector.subject_id,
      };
      expect(assignmentBucket({ domain: "traffic", ...common })).toBe(
        vector.traffic_bucket,
      );
      expect(assignmentBucket({ domain: "arm", ...common })).toBe(
        vector.arm_bucket,
      );
    }
  });
});
