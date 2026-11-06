# MOMIYU app identity

Artwork explicitly supplied and selected by the user for MOMIYU branding:
a white headphone-wearing companion, cyan/purple tile and MOMIYU lettering.
This is the application's identity, not a required appearance or evolution
route for individual pets.

- `momiyu-source.png`: byte-identical copy of the user-provided image.
- `momiyu.png`: 512px app image.
- `momiyu.ico`: 16, 20, 24, 32, 40, 48, 64, 128 and 256px Windows frames.

Desktop shortcut, BrowserWindow icon and in-app branding use this identity.
The artwork is preserved; export only fits it into a transparent square and
resamples for required icon sizes. No image generation or creative edit is used.

To regenerate exports, run `tools/desktop/build-icons.cjs` with the existing
project-local Electron runtime. It creates only owned hidden windows, writes
runtime data into `.local/icon-build/`, and saves the selected PNG/ICO here.
Contact-sheet previews remain ignored in `.local/icon-build/`.
