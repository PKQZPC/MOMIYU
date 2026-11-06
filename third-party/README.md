# Third-party notices and source provenance

The root software license applies to original MOMIYU software. Upstream
portions of the adapted player, pointer input, and character pack in
`packages/pet-runtime/` retain their MIT terms. See the
[DeskCat notice](licenses/deskcat.txt),
[desktop-pet notice](licenses/desktop-pet.txt), and
[adaptation provenance](m0-pet-adaptations.md).

## M0 source audit

[m0-sources.lock.json](m0-sources.lock.json) records the exact commits and
license-file hashes examined in M0. These are audit inputs, not an installed
production dependency list. Only the pinned FOCAL grouping baseline was run,
with synthetic metadata and a deterministic fake model. Other entries have
source/license metadata checks, not end-to-end integrations.

Full source snapshots and audit copies of the upstream licenses stay in the
ignored `tools/m0/.local/upstream/` cache. ActivityWatch watcher code is
MPL-2.0, and the other modules recorded in the M0 audit are MIT. These audit
entries document the reviewed packages and their license scope.

The isolated Electron probe used official `v45.1.0`, Windows x64 archive
`electron-v45.1.0-win32-x64.zip`, SHA-256
`55eaba17abff7b5bba6c3bbc85068967379024fe742fe9c7fdba9118922ccbe2`,
checked against the release's official `SHASUMS256.txt`.
This runtime and its bundled licenses remain in the ignored probe cache;
it has not been selected or packaged for production.

Python probe dependencies are pinned in `tools/m0/requirements.txt` and were
installed into its isolated `.local/python-deps/` directory. No global Python
environment or proxy installation was changed.

[m0-pet-sources.lock.json](m0-pet-sources.lock.json) separately records 23
reviewed files from DeskCat, TonyNa-code/desktop-pet and AIRI. All three code
licenses are MIT; artwork and other runtime components require independent
license review. Source cache verification and one dependency-free animation
module experiment do not establish adoption of these applications. Authorized
M0 adaptations now live in `packages/pet-runtime/`; see
[adaptation provenance](m0-pet-adaptations.md) and the retained MIT notices.

The image-validation harness uses isolated OpenAI Python SDK 2.6.1 and pinned
transitive dependencies in `tools/m0/requirements-images.txt`. It delegates
generation/editing to the existing imagegen skill CLI without modifying that
file; the local case archive records its SHA-256.
No proxy configuration or credential is copied into this repository.
