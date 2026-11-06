# Versioned demo datasets

## Try the complete offline walkthrough

Requires Node.js 24 or later. From the repository root:

```powershell
node tools/desktop/run-offline-demo.cjs
```

No model credentials, network calls, or paid images are needed. The runner
verifies and imports the existing synthetic `egg_journey/v001` and
`skill_practice/v001` records. It exercises the actual runtime services:

1. Choose an egg, organize experiences, and publish an example hatchling.
2. Propose a skill candidate without announcing acquisition.
3. Prepare example skill materials and perform a local-tool trial.
4. Check the method against a later workflow, then assess acquisition.
5. Use the learned skill to read the synthetic records and save handoff files.

Model responses are explicitly scripted by [offline-model.cjs](offline-model.cjs).
The images are the included example character pack. These predictable outcomes
demonstrate service orchestration, not AI quality or independently learned skills.
The later-prefix prediction receives no continuation or full workflow; the normal
comparison and trial requirements still apply.

The terminal prints a new profile path, a report, actual task-file paths, and a
desktop launch command. After preparing Electron as described in the main
README, close any running MOMIYU instance before using that command. The profile
is labeled as synthetic; its Growth Journal, skill, and saved task history are
ready to inspect. Model calls are disabled when preparation ends. To explore
another offline run, rerun the command; live tasks require a model connection.

Nothing is imported from existing accounts, screenshots, keyboard records, or
credentials. The runner never modifies the account registry. Each run stays in
the ignored `demo_data/.local/runs/offline_walkthrough/` directory.

`catalog.json` lists the available scenarios and versions. Dataset versions are
immutable: corrections or additions create a new version directory. Schema
version and dataset version are separate concepts.
Git attributes preserve dataset bytes across Windows and Unix checkouts so
the manifest hashes remain valid.

```
demo_data/
  catalog.json
  scenarios/<scenario-id>/<version>/manifest.json
  scenarios/<scenario-id>/<version>/sessions/*.json
  .local/runs/<scenario-id>/<version>/<run-id>/
```

All scenario records are synthetic. They exercise the normal experience intake,
sleep, growth, generation and publication services; they do not represent the
owner's actual life or prove that external application collection is complete.
Generation Agents receive the scenario's factual material through the ordinary
input contract, without development instructions mixed into experience prose.

Each manifest records provenance, stable record IDs, event times, session file
hashes and the intended coverage. Change a dataset by adding a version and then
updating the catalog, never by rewriting the old files. Never add credentials,
private observations, databases, generated images or model responses to source
dataset folders. `.local/` is ignored by Git.

Each run has its own profile and ledger: dataset manifest hash, source hashes,
model, call reservations/usage, image limit, state transitions and final result.
A resumed run uses its original ledger and profile; it does not silently start
again or reset its image allowance. The desktop displays a simulation label
when opened on a dataset profile. Ordinary user profiles are kept separate.

## Egg-origin journey

`egg_journey/v001` has four chronological batches (11 synthetic records).
It targets accumulation, hatching and two further changes without forcing AI
decisions. Keep `evolution_journey/v001` as the earlier single-sleep experiment.

Prepare an isolated profile without network or model calls:

```powershell
node tools/desktop/run-egg-journey.cjs --prepare --color ivory
```

Real execution requires explicit `--run --budget <project-local-json>` and
`--proxy-config <existing-config>`, optionally `--resume <prepared-run-directory>`.
The budget must be approved before creating an executable approval file.
It specifies `approved`, `model`, `model_calls`, `image_calls` and
`automatic_retries` (zero). The runner allows at most 32 analysis calls and nine
image calls, reserves each before sending, stops on failure/incomplete material,
and disables model permissions on exit. It neither starts nor stops a proxy.
After a stopped batch, inspect the ledger before authorizing any continuation.
Never relabel controlled-test results as real model-generated pet versions.

Egg color is claimed once per profile. Preparation claims its specified color;
running the desktop on that profile does not reopen selection. To inspect fresh
onboarding, create a separate empty local profile instead of clearing the run.

Code/prompt revisions do not require a new dataset version. Revalidation uses
the same immutable `v001` records in a separate local run. The local helper
`node tools/desktop/prepare-growth-revalidation.cjs <completed-run-directory>`
forks the hatch checkpoint, retaining its past evidence and generated assets,
excluding later evidence/results and recording the source ledger hash. Its
first two batches are explicitly marked as reused; the ordinary runner then
feeds the unchanged remaining batches in order. Prior API costs stay in the
source ledger. The continuation begins with zero new calls, disabled model
permissions and no implied budget approval. No dataset/catalog files are added
or modified by preparing a continuation.

Character generation now includes a separately checkpointed design-concept
analysis before the image call. Include that analysis in any proposed budget.
Each explicitly enabled semantic revision also needs a new concept, image and
review; none reset prior usage. `--design-revisions 1` opts into at most one
feedback revision inside the already approved budget (allowed values 0–2;
default 0). This is bounded design iteration, not a transport retry. The old
real-run outputs stay unchanged and do not validate the new generation process.

A fresh run may validate the pipeline without becoming the active pet. Keep
its ledger and visual lineage separate from the existing demo. Revalidation
of an existing pet should reuse its adopted checkpoints and images. The runner
reports actual `post_hatch_evolutions` and `growth_target_met` separately from
batch processing status; these are demonstration targets, not product evolution
limits. An unadopted candidate can leave a batch processed without satisfying
the growth target. `--revisit-batch` and `--recheck-candidate` require an explicit
reviewed-resume reason and retain earlier snapshot history.

`--replay-analysis N` can reuse an already paid successful analysis after a
local contract fix, only when its exact system/input hash matches the current
request. A source-file hash and recovery reason are recorded; usage is not
charged again or counted twice. It cannot repair or fuzzy-match a wrong ID.

Explicit historical-rejection redesign uses --historical-rejection together with
--revise-rejected-design and --reviewed-resume. Original rejected artifacts and
reviews remain archived; the new candidate uses the current review policy.
This does not adopt an old candidate or silently retry a failed request.

The skill_practice/v001 supplement adds later independent observations to the
existing egg-journey profile. It does not alter the original eleven records or
regenerate the pet. run-skill-demo.cjs keeps its own additive budget ledger and
resumes only with an explicit reviewed reason. Native tool calls, actual output
files, failures, source hashes for exact paid-result replay and AI assessments
remain local. Pipeline completion is separate from general-purpose automation.
