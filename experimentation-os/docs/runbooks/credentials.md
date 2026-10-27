# Credential rotation and revocation

Primary owner: **Unknown**  
Backup owner: **Unknown**

1. Identify the exact project/environment, capabilities, dependent service, and change window.
2. Rotate through the scoped API. Deliver the replacement through the authorized secret manager; never source control, browser state, chat, or logs.
3. Verify the old secret returns 401 and the replacement preserves the retained assignment ID/arm.
4. Update one service at a time and observe assignment/event errors before continuing.
5. Revoke an exposed or retired credential, verify denial, and inspect the immutable audit record.
6. If attribution becomes uncertain, stop enrollment and investigate rather than creating new identities.

Production secret-manager delivery, owner notification, and service inventory are **unknown** and block admission.
