# Windows capture modules

This package contains the Windows helpers used by the local runtime.
The ordinary desktop client currently takes external experience evidence
through two independent sources, keyboard events and periodic screenshots.
Both are controlled in the desktop settings.

## Keyboard events

[raw-input.ps1](raw-input.ps1) runs the keyboard helper. The runtime's
[raw-input-observer.cjs](../../services/local-runtime/src/raw-input-observer.cjs)
receives Windows virtual-key codes, batches them, and saves them under the
current profile.

These are key events. Reliable reconstruction of the text confirmed by an
existing input method remains unresolved. Enabling this source does not
establish full external-chat or message-history capture.

## System screenshots

[screen.ps1](screen.ps1) and [ScreenCapture.cs](ScreenCapture.cs) capture the
visible display containing the foreground window. Their lifecycle is managed
by [screen-observer.cjs](../../services/local-runtime/src/screen-observer.cjs).

Screenshots are independent of keyboard and UI Automation observation.

- Capture follows 30 minutes of accumulated eligible device use. Reading and video time count.
- Lock, suspend, and display-off pause the timer. Resume restarts the helper with its saved use time.
- A persisted capture acknowledgement resets the timer. Clicks and window changes do not request extra images.
- Identical PNGs can reuse one file while preserving distinct capture events.
- Local capture and model sending have separate settings. Eligible sleep batches may attach up to two selected unique screenshots.

Pictures, events, checkpoints, and previews stay in project-local storage.
Storage pressure pauses new writes while preserving existing evidence.

## Experimental interface observer

[observer.ps1](observer.ps1), [Observer.cs](Observer.cs),
[InterfaceStructure.cs](InterfaceStructure.cs), and
[SubmissionTracker.cs](SubmissionTracker.cs) provide the retained UI Automation
experiment. The normal desktop entry disables this observer.

It can extract bounded foreground structures, readable objects, and some
process evidence when accessibility providers expose them. Its experimental
application scope and object/message extraction are outside the current
everyday setup. The absence of an accessible provider can leave only a few
nodes, with no readable conversation.

The runtime stores experimental event order and reusable content versions
separately. Checkpoint reads preserve the boundary between a prediction input
and the continuation used to evaluate it.

## Development checks

Run from the repository root:

```powershell
node --test tests/windows/screenshots.test.cjs
node --test tests/windows/capture.test.cjs
```

Native probes in `tools/windows/` operate owned fixtures unless their explicit
scenario says otherwise. Their data and reports stay under
`.local/windows-capture/`. Synthetic or fixture checks do not establish
compatibility with every third-party application.

The helpers use Windows PowerShell and keep their compilation temporary files
inside the project. For user setup and supported sources, see the
[desktop guide](../../apps/desktop/README.md).
