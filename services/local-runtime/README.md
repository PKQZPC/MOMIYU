# Local runtime

The runtime turns stored experiences into memories, growth decisions, and
skills. It runs in the desktop main process and keeps its database and generated
files inside the project. Start with the [desktop guide](../../apps/desktop/README.md)
for setup and everyday use.

## Experience and rest flow

The source record, an analysis result, and a published appearance each have their
own identity. A successful experience batch records exactly which observations
it used. Later batches skip those source records while using relevant derived
memory as context.

A nap can be rest only. New eligible evidence or an unfinished phase can start
model work when the configured connection is available. Experience consolidation,
skill processing, and appearance publication have separate states.

| Responsibility | Main modules |
| --- | --- |
| Source records, permissions, batches, and dependencies | [store.cjs](src/store.cjs), [analysis.cjs](src/analysis.cjs) |
| Orchestration, cancellation, and account lifecycle | [runtime.cjs](src/runtime.cjs) |
| Automatic rest and local usage-pattern estimation | [auto-nap.cjs](src/auto-nap.cjs), [rest-routine.cjs](src/rest-routine.cjs) |
| Keyboard-event batches and independent system screenshots | [raw-input-observer.cjs](src/raw-input-observer.cjs), [screen-observer.cjs](src/screen-observer.cjs) |
| Individually selected saved files | [file-observer.cjs](src/file-observer.cjs) |
| Persistent memory, skills, and visual history | [life-store.cjs](src/life-store.cjs) |

The ordinary desktop entry disables the experimental UI Automation observer.
Its code and older evidence remain available for development.

## Growth and visual continuity

[Growth context](src/growth-context.cjs) assembles relevant experiences, earlier
pet context, and visual references. The lifecycle judges whether growth is
warranted, develops a design concept, generates the image, and prepares actions
for the proposed form.

The character Agent uses the latest form and relevant history to reason about
continuity. Action planning considers the whole character, including personality
and style. Some actions can be inherited with updated artwork; others need
adaptation. Design and material results are checked before the appearance is
published.

- [character-design.cjs](src/character-design.cjs) owns concept and reference preparation.
- [lifecycle-evolution.cjs](src/lifecycle-evolution.cjs) coordinates generation, review, and publication.
- [action-contract.cjs](src/action-contract.cjs) validates action identities and material bindings.
- [appearance.cjs](src/appearance.cjs) provides image transport and legacy flow compatibility.

An interrupted or rejected attempt keeps its previous evidence. The effective
form remains available while a new candidate is incomplete. Image requests use
bounded attempts and retain their usage history.

## Skill learning and execution

[skill-learning.cjs](src/skill-learning.cjs) compares a fixed skill version
against later evidence, conducts assessments, and maintains proficiency. A
prediction is persisted before the later process and result are revealed.
Process records keep their source and time boundaries.

[skill-materials.cjs](src/skill-materials.cjs) prepares actions for the skill
against the current appearance. Acquisition is displayed once the assessment
and usable material are ready.

[skill-execution.cjs](src/skill-execution.cjs) runs the method with the registered
[tools](src/skill-tools.cjs). Current tools search and read eligible local
experiences and save new files in that task's directory. Tool outputs go back
through matching function-call IDs. Task history preserves actual steps,
artifacts, and completion state.

A trial, an independent observed workflow, and a learned-skill task remain
distinct evidence. Broader web and desktop tools are future work.

## Model connections and usage

[model.cjs](src/model.cjs) reads an existing loopback proxy configuration and
makes bounded requests. [chatgpt-binding.cjs](src/chatgpt-binding.cjs) owns the
profile-scoped browser authorization, direct Codex transport, and reported
usage records.

Proxy-backed analysis, visual growth, and skill execution have real-model
verification with synthetic data. The direct bound-account route has simulated
request coverage; live authorization and image generation remain to be checked.

Prompts live in [prompts](prompts/). The model receives the selected sources and
bounded context. One nap can involve several Agent calls and image requests.
Call attempts, generation stages, and source dependencies are tracked separately.

## Storage and recovery

SQLite stores observations, jobs, memory entries, skill versions and assessments,
task runs, growth requests, and appearance versions. Source-to-job links support
coverage and dependency invalidation.

- A completed consolidation batch excludes its source records from repeat consolidation.
- Interrupted work retains its evidence and checkpoint state.
- Failed analysis waits for explicit retry where the automatic path excludes it.
- Waking cancels unfinished requests; already committed experience results remain.
- Deleting source evidence invalidates dependent results and their private artifacts.

For reproducible scenarios and request-budget conventions, see
[demo_data](../../demo_data/README.md). Runtime profiles, credentials, captures,
model responses, and generated outputs stay outside Git.
