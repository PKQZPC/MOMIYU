# Versioned domain contracts

`domain.schema.json` is the M0 Draft 2020-12 schema proposal. It separates raw
observations, immutable content versions, evidence nodes, workflow attribution,
user understanding, shared memories, skill versions, pet asset versions,
analysis work, external task execution and model-request manifests. Large
content is referenced; candidate/effective/history are explicit.

The schema and `validation.py` check shape and explicit timezone-aware timestamps.
The timestamp checker is registered explicitly because optional format extras
are not installed; a default format checker can otherwise silently skip dates.
`boundary.mjs` is a small M0 executable boundary
experiment, not the product authorization/runtime. It resolves complete
transitive evidence dependencies against a checkpoint, source grants and
private/screenshot rules. Actual persistence and every I/O path must enforce
the same checks in M1/M2; a schema alone cannot provide access control.

Contract version: `0.1.0`. Changes require compatible reading or an explicit
migration. Do not modify retained historical evidence when changing attribution.
Do not put provider secrets or content bodies into identifiers.

Pausing acquisition blocks new observations; it does not itself revoke access
to retained evidence. Stored-source read access, source collection permission,
the acquisition master switch and model transmission are distinct checks.

The M0 schema is deliberately incomplete: source grants, observed-object
registries and pet-state records are referenced or supplied to boundary probes,
but do not yet have standalone durable schemas. Referential integrity,
migrations and enforcement across real adapter I/O remain M1 work; this is
not a claim that all product data structures have been implemented.
