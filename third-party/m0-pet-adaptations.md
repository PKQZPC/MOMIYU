# M0 pet module adaptations

These began as M0 adaptations, not adoption of an upstream app.
Original source pins/hashes are in `m0-pet-sources.lock.json`.

The shared implementations now live in `packages/pet-runtime/`; the paths
below retain CommonJS compatibility entries for the original M0 probes.
Browser fixtures load the shared scripts directly. The desktop demo uses
the adapted player and pointer interaction without copying upstream art.

| Adapted file | Origin | Changes |
| --- | --- | --- |
| `tools/m0/reuse/animation-player.cjs` | DeskCat `src/renderer/animation-player.js`, `b5718472223bdb23d01abf92dae7bbd8d7de39b1` | Validate clips/time; hold final frame for full interval; arbitrary names; optional no-restart; bounded elapsed; browser/CommonJS export |
| `tools/m0/reuse/pointer-input.cjs` | DeskCat `src/renderer/input-handler.js`, same commit | Pointer capture/cancel/disposal; drag threshold; current-frame alpha hit test and stationary-pointer refresh; primary button; hold hover during drag; coalesce unchanged hover |
| `tools/m0/reuse/character-pack.cjs` | TonyNa-code/desktop-pet `src/character-import.js`, `d4f7992bec15adaa2687a1635a86864b5c822a09` | Folder-only M0 scope; require decoder; multi-sheet/dynamic skill mapping; full content digest; guarded staging/idempotence; preserve prior pack on invalid candidate |

MIT license notices are retained in `licenses/deskcat.txt` and
`licenses/desktop-pet.txt`. No upstream artwork, sounds or growth/mood rules
are included. Upstream source cache remains unmodified.

M0 does not import ZIP archives; generated assets enter through an explicit
folder. No archive dependency is installed. This local validation choice does
not change the first-version data-collection or growth design. The normalized
`m0-pet-pack-1` format is provisional; it is not a product schema migration.

`tests/fixtures/m0/pet-reuse-renderer.js` is an original M0 integration driver:
it loads candidate sheets before a visual swap, suppresses stale asynchronous
loads, keeps display aspect ratio, and moves the drawn body in response to
adapted pointer events. It does not add a product interface or skill executor.
Test art uses the existing QA installation of `pngjs` 7.0.0; no new dependency
was installed in this iteration.
