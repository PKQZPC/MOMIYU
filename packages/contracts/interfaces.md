# M0 interface contract proposal

All envelopes carry protocol/schema version, request ID and scoped source.
No default remote server or global collector is introduced by these interfaces.

| Boundary | Request | Reply | Required enforcement |
| --- | --- | --- | --- |
| Browser adapter to local runtime | Event ID, authorized source, object/version, committed operation, content/result references, gaps | Accepted/rejected, canonical event ID, reason | Source acquisition permission and master pause, event size, schema, duplicate identity |
| Local evidence reader | Explicit version references, purpose and checkpoint/manifest | Exact referenced material, provenance and gaps; no latest-version fallback | Source read access, deletion, transitive dependencies and availability boundary |
| Model request builder | Fixed skill/version, role, allowed evidence, image permission, reserved budget | Request manifest and selected context or denial | Source transmission permission, API master, image policy, no hidden unrestricted retrieval |
| Model adapter | Approved manifest and role-specific payload | Returned result/status, actual model, usage and latency | Configured loopback proxy, exact allowed model, bounded output, unknown completion distinct from failure |
| Analysis scheduler | Frozen batch, evidence/version dependencies, role and saved checkpoint | Candidate result/check record or explicit deferred/uncertain state | Budget reservation, version checks, no duplicate settlement, distinct publication step |
| Tool execution | Bound skill/version, reviewed task/resource authority and current target reference | Observed outcome, artifact references, effects and uncertainty | Per-operation scope and cancellation; model or page cannot self-authorize |
| Pet asset loader | Eligible asset/version group and runtime references | Coherent loaded group or retention of prior usable group | Checksums/format/anchors and compatibility; no partial effective update |

The M0 loopback HTTP probe uses an ephemeral bearer token and a synthetic
fixture. The Electron-to-Python probe uses newline-delimited JSON over stdio.
M1 may use authenticated native messaging/IPC for extensions; M0 does not
establish that an installable extension, durable queue or every I/O path is ready.
Schema migration/version negotiation and size limits must be implemented before
production ingestion. API keys are configured externally, never part of envelopes.
