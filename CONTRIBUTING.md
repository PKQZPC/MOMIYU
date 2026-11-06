# Contributing

Ideas, fixes, and experiments are welcome. Discuss substantial changes in
[Discussions](https://github.com/PKQZPC/MOMIYU/discussions) so we can agree on the behavior
before changing it. For questions and collaboration, contact
[zhoupengcheng0219@gmail.com](mailto:zhoupengcheng0219@gmail.com).

## Run locally

Use Node.js 24 or later. The offline walkthrough and Node test suite need no
npm dependencies or model credentials:

```powershell
node --run test
node --run demo:offline
```

See the [desktop guide](apps/desktop/README.md) to download the pinned Electron
runtime and launch the Windows app. Do not confuse Electron's runtime version
with MOMIYU's application version.

The [demo dataset guide](demo_data/README.md) explains the synthetic scenarios
and distinguishes scripted offline outcomes from live model validation. Live
model tests require your own configuration and an explicit call budget. No
automated test needs real account input, private screenshots, or API secrets.

## Keep public changes reproducible

- Use synthetic records in tests, screenshots, and issue reports.
- Keep account databases, credentials, captures, generated task files, and
  local execution reports under ignored `.local/` directories.
- Keep code and persistent runtime data inside the project directory.
- Preserve source references, version lineage, and independent skill checks.
- Fix a failing transition in code; do not edit business states to make a
  scenario pass. Keep model test doubles clearly labeled.
- Add verification for behavior that could lose evidence, duplicate work, or
  publish a skill or appearance too early.

Include a short explanation of the resulting behavior and the checks you ran.
Respect [LICENSE](LICENSE) and retain applicable
[third-party notices](third-party/README.md).
