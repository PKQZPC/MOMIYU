# Initial egg assets

`v001/` is the installed two-style, five-color pack. `manifest.json` records
source/output SHA-256 values and preparation. `soft/white.png` preserves the
original white egg, without regeneration or recoloring. All other members were
generated as individual transparent sprites through the unchanged imagegen CLI,
using the authorized existing proxy, `gpt-image-1.5`, medium quality and zero SDK
retries. Detached alpha islands were removed during sprite preparation; raw
outputs remain in ignored project-local artwork runs.

| Runtime style | Display name | Files |
| --- | --- | --- |
| soft | 柔和款 | white, green, purple, red, blue |
| pearl | 珠光款 | white, green, purple, red, blue |

Runtime color keys remain `ivory`, `mint`, `lavender`, `red`, `blue` for profile
compatibility. File names use their plain color names. Missing old style fields
mean `soft`. A profile confirms the style and color together once; source
artwork updates do not reopen that choice. Subsequent AI growth is not limited
to the initial style or color.

Prompts are versioned independently from the installed pack:

- `requests/v001/`: first four pearlescent colors, retained as requested.
- `requests/v002/`: four softer variants matching the original white egg.
- `requests/v003/white.txt`: pearlescent white completing the second set.

User references, raw responses, credentials, generation ledgers and the contact
sheet are under `.local/`, not in this source asset directory. No user data is
embedded in these images or prompts.
