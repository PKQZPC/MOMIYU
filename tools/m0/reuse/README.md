# M0 pet reuse adaptation

This directory contains isolated adaptations, not the production pet runtime.
Playback and pointer handling derive from DeskCat; pack reading, validation,
content identity and staging derive from TonyNa-code/desktop-pet.
Exact origins and modifications are in `third-party/m0-pet-adaptations.md`.
Upstream MIT notices are retained in `third-party/licenses/`.

The modules do not collect user activity, call models, define growth rules,
start tasks or announce skill acquisition. Fixtures use procedural test art.
The M0 normalized pack format is experimental, not a durable product schema.

## Interfaces

| Module | Interface | Boundary |
| --- | --- | --- |
| Animation | `AnimationPlayer(clips)`; `play`, `update(seconds)`, `currentFrame`, `isDone` | Arbitrary clip names; animation completion never declares task success |
| Pointer | `createInputHandler(element, {hitTest, emit, reportHover})`; `refresh`, `cancel`, `dispose` | Current-frame alpha; pointer capture; no global input listeners |
| Pack | `readPack(explicitFolder, decodeImage)` | Mandatory real PNG decoder; no archive, remote resource or background scan |
| Installation | `installPack(validatedPack, explicitStore, decodeImage)` | Full content identity, verified staging, no partial installed version |
| Selection | `PackSelection.activate(explicitFolder)` | Retain previous version when validation fails; not the product publication engine |

Packs accept the upstream folder/`character.json` layout and single-sheet
fields (`sprite`, `preview`, `frame`, `columns`, `states`). The M0 extension adds
`sheets` with independent PNG/grid sizes, a state's `sheet`/`loop`, and
`skills` mapping a skill ID to an existing nonlooping activation clip.
No fixed skill list or species is required. Frame anchors and complete product
action manifests remain outside this provisional format.

The renderer fixture decodes all candidate sheets before swapping its current
version. It refreshes alpha with the displayed frame, preserves aspect ratio,
and refuses a stale asynchronous candidate after a newer selection. A normal
generated file folder is an input, not a user appearance-editing feature.

Current limits are 32 sheets, 128 states/skills, 64 MiB of image bytes and
32 million decoded pixels per candidate. These M0 validation bounds protect
the probe; they are not confirmed product storage budgets.
