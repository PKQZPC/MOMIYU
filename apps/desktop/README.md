# Desktop guide

[English](README.md) · [简体中文](README.zh-CN.md) · [Project overview](../../README.md)

MOMIYU currently runs from source on Windows x64. Its local account, pet,
experiences, generated materials, and task results live inside the project.

## Start the app

Run these commands from the repository root with an installed Python 3:

```powershell
python tools/m0/prepare-electron.py
.\apps\desktop\open-demo.cmd
```

The first command downloads a checksum-verified Electron runtime into the
project. The second opens the local account screen. Sign in or register,
choose your egg, and confirm the selection. The egg's color and style belong
to that pet once claimed.

For a desktop shortcut with **Ctrl+Alt+M**, run:

```powershell
.\tools\desktop\install-shortcut.ps1
```

The shortcut points back to the project, so keep the project in place.
Normal startup uses one app instance.

## Spend time with your pet

| Action | What happens |
| --- | --- |
| Hover over the pet | Its controls appear and ordinary interaction can play. |
| Click the pet | Opens chat. |
| Double-click the pet | Opens its growth details. |
| Drag its body | Moves it on the desktop. |
| Open **Skills** | Shows learned skills, practice candidates, and task results. |
| Choose **Nap / Wake** | Starts a manual rest or wakes it. |
| Change display size in Settings | Resizes the desktop pet and remembers your choice. |
| Close the companion panel | Leaves the pet on the desktop. |
| Use the pet's × control | Exits MOMIYU. |

The Growth Journal keeps the pet's visual history and shared memories.
The skill collection puts acquired skills first. A skill card explains its
ability and proficiency and has a field for the next task's goal.

## Connect a model

Open **Settings** (`相处设置`). The app has two connection paths:

| Connection | Setup and current verification |
| --- | --- |
| Bound ChatGPT account | Use **Continue with ChatGPT** to authorize in the browser. The connection belongs to the current local account. Inference, image routing, and usage tracking have simulated-request coverage; live authorization and generation on this direct route still need verification. |
| Local API proxy | Start a compatible local proxy and select its existing YAML configuration. The current reader accepts a loopback host, port, and API key. Real-model analysis, growth, and local skill execution have been exercised through this path with synthetic data. |

Enable model calls and select the sources it may use. **Check model connection**
checks the configured model endpoint. Appearance generation has its own switch.
One growth event can require a design image and action materials, with several
analysis calls along the way.

For a bound account, MOMIYU shows recent calls and cumulative reported token
usage, with more history available. These are the calls and usage recorded by
MOMIYU; the provider's account page remains the place to check its own balance.

## Let experiences accumulate

Collection and model submission have separate controls.

| Source in this preview | What is saved |
| --- | --- |
| Computer input | Batches of Windows virtual-key codes. This records key events; reliable text confirmed by the existing input method remains unresolved. |
| Periodic screenshots | A picture after 30 minutes of accumulated eligible use. Reading and video time count. Lock, suspend, and display-off pause the timer. |
| Pet conversations | Messages saved under the in-app chat setting. |
| Notes | Experiences you choose to add in the companion panel. |
| Selected files | Saved versions of individually chosen UTF-8 txt, md, or csv files, up to 32KB each. |

The ordinary desktop entry uses input events and screenshots for external
activity. The older UI Automation adapter remains experimental and is disabled
in that entry. Application allowlists and browser pairing are outside the
current everyday setup.

**Experiences** shows saved records. Analysis coverage shows which records have been processed. “Completed” means
that experience consolidation was saved. Growth and skill preparation have
their own progress and can finish separately.

## Rest, reflection, and growth

Natural naps and a default **23:00–07:00** rest window are enabled.
Outside that window, the current initial setting allows a short nap after
about 20 minutes without direct pet interaction or an active task.
Chat and task execution defer automatic rest. You can wake it early.

Adaptive scheduling observes longer lock or suspend intervals while the account
is running. With enough recent observations, it estimates a rest window from
your PC-use pattern. Settings shows the effective window and its source.
You can turn adaptation off and set times manually. Existing manual times
take priority.

A nap may be simple rest. New eligible evidence or a resumable analysis phase
can lead to model work when a connection is available. Successfully consolidated
source records are excluded from another consolidation batch; their derived
memories can inform future analysis.

AI judges whether growth is warranted and how it develops from earlier forms.
When generation is enabled, the system prepares a design and usable actions
before publishing the new appearance. The old form stays active while that work
is pending. Skill growth and appearance changes can happen in different naps.

## Learn and use a skill

A method starts as a candidate. Later observed workflows are used to test it:
a prediction is saved before the continuation is revealed. Trial execution and
later evidence inform the AI's assessment of acquisition and proficiency.

Once the assessment and compatible action materials are ready, the skill
appears as acquired. Open **Skills**, enter a goal, and activate it. The pet
plays the corresponding action while the task runs, and the result stays in
the task history.

Current tools can search and read saved experiences and write new local task
files. The demonstrated task turns records into a guide with a Mermaid
flowchart and Q&A. Web search and arbitrary cross-application automation are
future work.

The source datasets are in [demo_data](../../demo_data/README.md). A prepared
test account is available only when its local profile and generated assets
are present; cloning the repository provides the scenario definitions.

## Accounts and local files

Register or sign in from the account screen. You can choose to remember an
account on this PC, then use its continuation entry next time. Switching to a
different account uses that account's credentials. Signing out stops its
observers and returns to the account screen.

Ordinary profiles and the account registry live under `.local/desktop/`.
Existing generated demo profiles keep their original project-local paths.
SQLite files, credentials, caches, temporary files, and model responses stay
out of Git.

## Development checks

The desktop entry and reusable runtime are separate. Window and IPC code live
here; business logic lives in [local-runtime](../../services/local-runtime/README.md).
Shared animation modules live in [pet-runtime](../../packages/pet-runtime/README.md).

Run an isolated desktop check from the repository root:

```powershell
.\tools\desktop\start.ps1 -Smoke
.\tools\desktop\start.ps1 -Smoke -VisibleCheck
```

The visible check opens owned test windows. Both use synthetic data and make
no model requests. Native interaction checks are in `tools/desktop/`.

The local development build defines the application version in
`apps/desktop/package.json`. Keep its
version, release notes, and Git tag consistent when preparing a release.
Electron and dataset versions are maintained separately.
