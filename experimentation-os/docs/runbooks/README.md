# ExperimentOS runbooks

These procedures describe the current local release candidate. They do not authorize cloud access, public deployment, real traffic, or customer-data handling.

| Procedure | Primary owner | Backup owner | Current evidence |
| --- | --- | --- | --- |
| [Deploy and rollback](deployment-rollback.md) | **Unknown** | **Unknown** | Local compatible-image drill only |
| [Backlog and ingestion outage](backlog-ingestion.md) | **Unknown** | **Unknown** | LocalStack and fault tests only |
| [Dead-letter replay](dead-letter-replay.md) | **Unknown** | **Unknown** | Isolated LocalStack replay drill |
| [Credential rotation and revocation](credentials.md) | **Unknown** | **Unknown** | Local API drill and tests |
| [Emergency disable](emergency-disable.md) | **Unknown** | **Unknown** | Local restored-environment drill |
| [Database restore](database-restore.md) | **Unknown** | **Unknown** | Quiesced logical backup drill only |
| [Subject deletion](subject-deletion.md) | **Unknown** | **Unknown** | **Not implemented; release blocker** |
| [Analysis amendment](analysis-amendment.md) | **Unknown** | **Unknown** | Invalidation/new-version contract only |
| [Operator handoff](operator-handoff.md) | **Unknown** | **Unknown** | Local audit transition only |

Before any staging or production use, replace every unknown owner with a named person and backup, approve the alert destination and retention policy, and rehearse the procedures in the authorized environment.
