# Desktop data and IPC overview

The desktop client uses project-local SQLite storage. Core schema version 2
supports the older text schema and adds lifecycle tables for memory, skills,
tasks, and appearance history. The authoritative definitions live in
[store.cjs](../../services/local-runtime/src/store.cjs),
[life-store.cjs](../../services/local-runtime/src/life-store.cjs), and
[screenshot-store.cjs](../../services/local-runtime/src/screenshot-store.cjs).

| Entity | Purpose |
| --- | --- |
| Settings | Typed configuration and separate local-save/model-send controls. |
| Observation | Source, role, content, timestamp, and source metadata. |
| Analysis job and job sources | Batch state, result, usage, and links to its input observations. |
| Memory entry | Persisted shared experience, user understanding, workflow, or pet context. |
| Skill version, check, and assessment | A method, its evidence boundary, later comparison, and acquisition/proficiency assessment. |
| Task run | Goal, actual tools, results, artifacts, and execution state. |
| Growth request | Checkpointed judgment, design, generation, and review. |
| Appearance version | Parent version, active/candidate state, material paths, and action bindings. |
| Screenshot event | Capture context and a reference to reusable image content. |

## Sources and boundaries

The ordinary desktop client uses `pet_chat`, `manual_note`, `file_document`,
`raw_input`, and `system_screenshot`. The retained experimental
`system_interface` path is disabled in that entry.

Raw input content represents virtual-key codes. File metadata preserves saved
versions. Screenshots reference local image content. The runtime checks the
sending setting before including each source in model context.

## IPC

The main process verifies the owned WebContents and frame before handling an
operation. The panel can request account, settings, evidence, growth, and task
operations. The pet receives appearance/rest state and task animation metadata
needed for playback, while conversation and evidence content stay out of its
state.

Renderer operations are exposed through [preload.cjs](../../apps/desktop/preload.cjs).
SQLite and model credentials stay in the main process. Source data and safe
operation results reach the panel through bounded handlers.

## Analysis, acquisition, and publication

Experience consolidation produces source-linked entries and candidates.
A successful batch is committed with its input links; the same observations
are excluded from later consolidation batches. They can support later skill
checks or contribute derived memory to context.

Skill checks preserve a prediction before exposing its continuation. Acquired
display requires both the learning assessment and usable action materials.
Task execution records actual tools and file outputs.

Growth uses relevant experiences and reference images, then proceeds through
concept, generation, action preparation, and review before publishing a form.
A pending candidate leaves the previous form active.

Deleting evidence invalidates dependent results. A deletion epoch guards
against storing late responses after deletion. Interrupted work retains
checkpoint information for the supported recovery path.

For user-visible behavior, see the [desktop guide](../../apps/desktop/README.md).
For module responsibilities, see the [runtime overview](../../services/local-runtime/README.md).
