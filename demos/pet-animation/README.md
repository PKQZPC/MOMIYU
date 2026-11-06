# Pet Animation Demo

For the desktop product, start with the [MOMIYU overview](../../README.md)
and [desktop guide](../../apps/desktop/README.md).

An isolated local demonstration of MOMIYU's lightweight animation direction.
This is not the product client. Tasks are simulated, and no user data is
collected, uploaded or analyzed. No API key or network dependency is required.

Open `index.html` directly in a modern browser, or double-click `open-demo.cmd`
on Windows. Generated previews and QA screenshots stay in ignored `.local/`.
Optionally run
`node server.mjs` from this directory and visit the printed loopback URL.

The demo uses reference AI artwork and local procedural animation. It includes
quiet idle motion, rest/wake interaction, two distinct activation effects and
shared running/completed/failed/canceled task feedback. The sample hatchling
is reference art, not a functioning evolution system. The sleeping
pose is an additional reference-based generated asset. `body-poses.png`
contains six reference-generated body poses for waving, head/ear movement
and stretching. The renderer plays these poses with stable foot anchors;
these are discrete key poses rather than continuous skeletal animation.

`assets/` contains project-local art. `state.js` owns transitions, `app.js`
renders and connects controls, and `styles.css` defines the presentation.
`tests/` checks meaningful transition and browser behavior. Local recordings
and screenshots belong in ignored `.local/`.

Artwork prompts and provenance are in `assets/provenance.md`.

Run state tests with `node --test tests/state.test.cjs`. Browser QA requires an
existing Playwright installation: set `MOMIYU_QA_MODULES` to its containing
`node_modules` directory and run `node tests/browser.cjs`. Windows QA uses the
installed Edge; `MOMIYU_BROWSER` can select an existing executable. No browser
download is needed. `tests/record-preview.cjs` exports actual browser-rendered
frames through the installed Sharp runtime; no standalone encoder is needed.
