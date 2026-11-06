# M0 capability probes

These opt-in probes use only synthetic fixtures. They are not a collector or
the product runtime. They do not enumerate personal windows, history or files.
Results go into ignored `.local/`; reports go into development records.
Generated-image evidence stays in the ignored local cache, not in Git.

- `probe-browser.cjs`: Edge/Chrome fixture DOM, committed text, conversation,
  objects, results, local bridge, capture deduplication and exclusion checks.
- `probe_windows.py`: native COM UIA checks against one owned invisible WinForms
  fixture. No desktop-tree enumeration. `experiments/probe-dotnet-uia.ps1` retains
  the unsuccessful .NET provider path for diagnosis; it is not the chosen route.
- `probe-models.mjs`: local proxy model discovery; `--run` explicitly enables
  bounded synthetic text calls. Credentials are read in memory, never reported.
- `probe-images.py`: bounded three-stage imagegen CLI adapter and one actual
  image-based judgment via the existing proxy; no retries, n=1, reserved ledger,
  interruption/concurrency lock. Requires isolated `requirements-images.txt`.
- `probe-generated-assets.cjs`: inspect returned alpha/dimensions and validate
  immutable pack ingestion/player/hit-testing in an owned headless Edge fixture.
- `audit-upstream.py`: runs the pinned FOCAL task-routing baseline on controlled
  metadata with a deterministic fake backend; no model or private content.
- `probe-storage.mjs`: local content/version and transactional SQLite experiment.
- `prepare-electron.py` and `fixtures/electron-main.cjs`: isolated official
  Electron runtime preparation, renderer isolation, stdio IPC and offscreen
  alpha probe. A failed alpha check must not be reported as desktop readiness.
- `probe-electron.ps1`: bounded offscreen/desktop launcher. Desktop mode uses
  two owned windows and two owner-checked screen pixels to test composition;
  it never captures a full display or changes the user's cursor position.
- `probe-package.ps1`: copied app-directory smoke test using the existing
  Electron/Python runtimes, not a standalone installer.
- `audit-pet-sources.py`: verify the 23 pinned interactive-pet source files;
  add `--fetch` explicitly to populate the ignored cache.
- `reuse/` and `probe-pet-reuse.ps1`: adapted DeskCat playback/pointer handling
  and desktop-pet folder-pack validation/staging, with a sandboxed Electron
  fixture. This is M0 verification, not a production-client integration.
- `experiments/`: bounded FOCAL routing adaptation, pet-player completion and
  blank/content-frame diagnostics. These are not production implementations.

Read individual command help and the M0 review before running probes. Model
text tests do not generate images. Listed image models are not proof of image
generation/animation suitability. Browser and GUI probes require the installed
browser, an interactive Windows session and permission to spawn helper processes.

Shared contracts belong in `packages/contracts/`, fixtures in
`tests/fixtures/m0/`, and tests in `tests/m0/`. Do not put runtime data or provider
configuration here. `.local/` is disposable synthetic output, not durable evidence.

## Reproduction

Run from the repository root in PowerShell. Set `$python312` to a working
Python 3.12 executable and `$node24` to Node 24. Set `MOMIYU_QA_MODULES` to the
existing QA module directory containing Playwright; do not use a personal
browser profile. Dependency installation requires network permission.

```powershell
& $python312 -m pip install --target tools/m0/.local/python-deps -r tools/m0/requirements.txt
& $node24 --test tests/m0/boundary.test.mjs
& $node24 --test tests/m0/render-pixels.test.mjs
& $python312 tests/m0/test_contracts.py
& $node24 tools/m0/probe-storage.mjs
& $node24 tools/m0/probe-browser.cjs
& $python312 tools/m0/probe_windows.py
& $python312 tools/m0/audit-upstream.py --fetch
```

The upstream audit downloads pinned public source files; its grouping defect
is an expected finding, not a passing production-routing implementation.
Browser checks cover installed channels only. Screenshot equality is an exact
fixture comparison, not the product's contextual deduplication or usage timer.

Model discovery requires an explicitly provided local proxy configuration:

```powershell
& $node24 tools/m0/probe-models.mjs --proxy-config '.local/proxy/config.yaml'
```

Adding `--run` sends up to three synthetic text requests, once per fixture case,
with no retries. Each invocation spends a new budget. The recorded M0 calls
already succeeded; rerunning is unnecessary to reproduce the offline tests.
No image call is included. Credentials remain in the external configuration.

Optional isolated Electron preparation uses a pinned release:

```powershell
& $python312 tools/m0/prepare-electron.py --version v45.1.0
$env:MOMIYU_PYTHON = $python312
& tools/m0/probe-electron.ps1 -Mode offscreen
& tools/m0/probe-electron.ps1 -Mode desktop
& tools/m0/probe-package.ps1 -Mode desktop
```

The fixed offscreen probe passes; desktop mode also verifies alpha, owned
backdrop composition and hit-target changes when mouse ignore is toggled.
It briefly shows owned fixture windows and closes them automatically. Only
single-monitor 200% desktop DPI was measured; unit fixtures cover 100%/200%.
Do not interpret an unpacked app-directory smoke test as a standalone
installer or long-running performance evaluation. See the
probe outputs in `.local/` for locally recorded evidence and remaining gaps.

Interactive-pet source review reproduction:

```powershell
& $python312 tools/m0/audit-pet-sources.py --fetch
& $node24 tools/m0/experiments/probe-pet-player.cjs
& $python312 tools/m0/experiments/probe-focal-routing.py
```

The player probe intentionally records the unmodified upstream early-completion
defect as a failed check, alongside a passing isolated repair. No artwork,
upstream project dependencies or upstream application are installed by it.

Adapted modules and real Electron-window verification:

```powershell
$env:MOMIYU_NODE = $node24
& $node24 --test tests/m0/pet-reuse.test.cjs tests/m0/boundary.test.mjs tests/m0/render-pixels.test.mjs
& tools/m0/probe-pet-reuse.ps1
```

Procedural test fixtures use the repository's PNG codec without external
modules; no character art or image-generation call is used for those fixtures.
Optional browser/image probes still use the separately configured QA modules.
The probe shows an owned transparent window, injects input into that window
through Chromium, verifies scoped IPC and closes all owned windows. It never
moves the system pointer or controls another application. Results and test
packs stay in `.local/`; MIT notices and adaptation provenance are tracked
under `third-party/`. See the
retained provenance in `../../third-party/m0-pet-adaptations.md`.

The authorized image round is already consumed. Do not rerun API stages to
reproduce offline checks, delete the ledger to replenish budget, recover a
stale request lock automatically, or silently restart the proxy. It was closed
after the actual calls. Images were generated/edited by the unchanged skill
CLI, whose client factory is supplied by the harness for loopback configuration,
retry suppression and usage accounting. No skill file was modified.
The final lock/count guard refinements were verified offline after the calls;
no additional requests were made to test them.

Offline budget regression and local material checks:

```powershell
& $python312 tests/m0/test_image_budget.py
& $node24 tools/m0/probe-generated-assets.cjs
```

The latter consumes `.local/image-validation-20261030/` outputs and requires
the locally retained three PNGs. A fresh clone does not include those outputs;
restore a local archive to reproduce this check. Keep the API ledger intact.
Read [case inputs and outcomes](../../tests/fixtures/m0/image-validation/README.md)
before planning a separately authorized round.
