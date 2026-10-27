import { createHash } from "node:crypto";

export function assignmentBucket(input: {
  domain: "traffic" | "arm";
  salt: string;
  identityNamespace: string;
  experimentId: string;
  configurationVersionId: string;
  subjectId: string;
}): number {
  const values = [
    "experimentos-assignment",
    "sha256-v1",
    input.domain,
    input.salt.normalize("NFC"),
    input.identityNamespace.normalize("NFC"),
    input.experimentId,
    input.configurationVersionId,
    input.subjectId.normalize("NFC"),
  ];
  const digest = createHash("sha256")
    .update(JSON.stringify(values), "utf8")
    .digest();
  return Number((digest.readBigUInt64BE() * 10_000n) / (1n << 64n));
}
