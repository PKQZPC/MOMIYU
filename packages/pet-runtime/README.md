# Pet playback and interaction

Shared modules used by the desktop overlay, companion panel, and local
animation experiments.

| Responsibility | Modules |
| --- | --- |
| Clip timing and named animation playback | [animation-player.cjs](animation-player.cjs) |
| Alpha hit testing, hover, and pointer capture | [pointer-input.cjs](pointer-input.cjs) |
| Click, double-click, control hover, and drag behavior | [desktop-interaction.cjs](desktop-interaction.cjs) |
| Rendering a version's character and material pages | [character-player.cjs](character-player.cjs), [sprite-layout.cjs](sprite-layout.cjs) |
| Choosing ordinary, rest, and skill actions | [pose-director.cjs](pose-director.cjs) |
| Window movement and valid coordinates | [window-position.cjs](window-position.cjs) |
| Explicit pack import and validation | [character-pack.cjs](character-pack.cjs) |

Action identities distinguish ordinary interaction, sleep, wake, skill launch,
and task-state actions. Character versions bind those identities to their own
materials. The player follows the active version's bindings and timing.

The current assets use key poses. Playback quality depends on the generated
material and its frame sequence. Generation and growth decisions live in
[local-runtime](../../services/local-runtime/README.md).

Pack import remains a development capability. The ordinary desktop UI uses the
published character materials.

Adapted upstream portions retain their MIT terms. See the
[DeskCat notice](../../third-party/licenses/deskcat.txt),
[desktop-pet notice](../../third-party/licenses/desktop-pet.txt), and
[adaptation provenance](../../third-party/m0-pet-adaptations.md).
