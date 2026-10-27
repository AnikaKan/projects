# Emergency disable

Primary owner: **Unknown**  
Backup owner: **Unknown**

1. Confirm the project/environment/experiment and the reason. Capture the current version to prevent a stale write.
2. An administrator invokes emergency disable and records the incident reference in the reason.
3. Verify new assignment requests return explicit `disabled` state with no fabricated control assignment.
4. Verify a real host renders its safe unavailable/disabled behavior and measure propagation time.
5. Stop finalization and mark the quality/analysis evidence accordingly. Existing assignment and audit history remain immutable.
6. Reopening requires a new reviewed plan/experiment; do not silently resume the stopped experiment.

The local drill verifies API propagation. A named owner, external incident route, and online-host propagation measurement remain open.
