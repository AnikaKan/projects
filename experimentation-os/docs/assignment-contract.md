# Assignment contract

The API, not a browser, decides assignments. For algorithm `sha256-v1`, the input is a UTF-8 JSON array with no extra whitespace:

`["experimentos-assignment","sha256-v1",domain,salt,identity_namespace,experiment_id,configuration_version_id,subject_id]`

Text values use Unicode NFC normalization. `domain` is independently `traffic` or `arm`. SHA-256 is calculated over those bytes; the first unsigned 64 bits in big-endian order are scaled into bucket `0..9999` with integer arithmetic. A traffic bucket must be below the frozen traffic basis points. The initial fixed arm split maps arm buckets `0..4999` to control and `5000..9999` to treatment.

The database uniqueness boundary is `(environment_id, experiment_id, subject_id)`. The first committed assignment wins; retries read that stored row. Missing identity, ineligibility, exclusion, closure, disablement, or service failure is explicit and never fabricated as a control assignment. The shared golden vectors in `contracts/assignment-golden-vectors.json` lock the encoding across Python and TypeScript.
