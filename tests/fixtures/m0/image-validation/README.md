# M0 synthetic image-validation inputs

This folder contains only the small synthetic prompt fixtures:
[baby.txt](baby.txt), [evolution.txt](evolution.txt), and
[transparent.txt](transparent.txt). They are historical test inputs, not the
production Agent prompt. Evolution receives the actual baby image; the
transparent edit receives the actual evolution image.

Generated PNGs, screenshots, request ledgers and model responses are local
verification outputs. They remain in the ignored
`tools/m0/.local/image-validation-20261030/` cache, not in this repository.
A clean clone can run procedural tests without them; inspecting the specific
generated-image case requires its local archive.

The completed three-image round used the existing local proxy with no
automatic retries. The image budget has been consumed. Do not rerun model
calls or clear a ledger merely to reproduce an offline check.

Recorded limitations: actual images were 1312x1199 despite requesting
1024x1024; the transparent derivative has edge contamination; the candidate
showed recognizable identity with subtle growth. Loading passed, but runtime
asset quality was held. No generated animation or production release follows
from this case.

