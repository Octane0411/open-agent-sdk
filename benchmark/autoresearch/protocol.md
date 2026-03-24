# Autoresearch Protocol

This file defines the default operating protocol for running autoresearch on
Open Agent SDK against Terminal Bench.

Read this file before editing code or running evaluations.

## Goal

Optimize OAS CLI and prompt behavior on Terminal Bench while keeping experiments:

- reproducible
- cheap enough to run repeatedly
- attributable to one hypothesis at a time
- easy to review after the fact

## Required Deliverables

Every autoresearch session is expected to produce four artifacts:

1. An experiment branch, usually named `exp/autoresearch-<tag>`
2. An append-only metric log in `benchmark/autoresearch/results.tsv`
3. A human-readable experiment report copied from
   `benchmark/autoresearch/report-template.md`
4. A Mermaid experiment tree embedded in the report, showing:
   - experiment IDs
   - parent/child relationships
   - the hypothesis for each node
   - pass@k and pass^k for each node
   - whether the node was kept or reverted

The git branch is not the source of truth for experiment history. The report and
`results.tsv` must record both successful and reverted experiments.

## Branch Strategy

Use separate branches for separate concerns.

- Infrastructure and harness changes belong on a normal feature branch and PR.
- Autoresearch runs belong on a dedicated experiment branch:
  `exp/autoresearch-<tag>`
- Do not run experiments directly on `main`.
- Do not run experiments on a branch whose PR is already merged.

Recommended flow:

1. Land harness changes first.
2. Create a fresh experiment branch from the harness tip or latest `main`.
3. Run experiments only on that branch.
4. Keep only winning code commits on the branch.
5. Record reverted experiments in the report and `results.tsv`, not in the
   final branch history.

## Fast Path For k > 1

When `k` is greater than 1, do not reinstall OAS and verifier dependencies on
every trial. Use the pre-warmed path.

### When to use pre-warmed images

Use pre-warmed images for:

- baseline runs with `k > 1`
- confirmation runs
- repeated experiments on the same candidate code state

Use local tarball mode only for:

- quick `k=1` sanity checks
- cold-path debugging
- validating that a new local code change can still be installed

### Fast-path workflow

1. If the OAS code under test changed, pre-warm the task images once:

```bash
bash benchmark/terminalbench/prewarm-images.sh \
  --tasks-file benchmark/terminalbench/task-lists/smoke-5.txt \
  --pack-local-tarballs \
  --force
```

2. Run evaluation against the pre-warmed images:

```bash
bash benchmark/autoresearch/run-experiment.sh \
  --tag "<experiment-id>" \
  --no-local-tarballs \
  -k 3
```

Notes:

- `run-experiment.sh` re-patches cached Harbor verifier scripts before each run.
- `run-experiment.sh` fails fast in `--no-local-tarballs` mode if a required
  task image is missing or does not contain the expected pre-warmed assets.
- The verifier patch makes cached `tests/test.sh` prefer `/opt/oas-verifier`
  when available.
- Pre-warmed images avoid repeated OAS setup. Patched verifiers avoid repeated
  `uv`/`pytest` downloads.

## Single Experiment Loop

Each experiment should test one hypothesis.

1. Read:
   - `benchmark/autoresearch/program.md`
   - `benchmark/autoresearch/scope.md`
   - this file
2. Choose one narrow hypothesis.
3. Edit only the minimum code needed to test that hypothesis.
4. Run the targeted test gate or full test suite.
5. Commit the candidate change.
6. If the change affects installed OAS behavior, re-run pre-warm once.
7. Run `run-experiment.sh`.
8. Update the report and experiment tree.
9. Keep or revert the candidate change.

## Decision Rules

Default policy:

- Keep if `pass@k` improves.
- Keep if `pass@k` holds and `pass^k` improves.
- Keep if both hold steady but the consistency gap shrinks in a meaningful way.
- Revert if `pass@k` regresses.
- Revert if `pass^k` regresses and `pass@k` does not improve.

If a run is noisy or suspicious, repeat the same experiment tag with a new
experiment ID and mark the earlier result as inconclusive in the report.

## Report Requirements

The report should let a new reader reconstruct the search path quickly.

For each experiment node, record:

- `experiment_id`
- `parent_id`
- `tag`
- `commit_sha`
- `hypothesis`
- `files_changed`
- `command`
- `k`
- `pass@k`
- `pass^k`
- `avg_trial_rate`
- `decision`
- `notes`

Also keep a short summary section with:

- current best experiment
- best `pass@k`
- best `pass^k`
- largest solved-task gain
- biggest regression seen so far

## Operational Rules

- Do not modify benchmark definitions while running experiments.
- Do not modify `results.tsv` by hand except to append machine-generated rows.
- Do not delete old rows from `results.tsv`.
- Do not clean Terminal Bench images during an active experiment campaign.
- Prefer exact experiment IDs in tags, for example `E0-baseline`, `E1-bash-hint`.
- Keep one variable per experiment whenever possible.
- If a change requires broad refactoring, split it into separate experiments.
