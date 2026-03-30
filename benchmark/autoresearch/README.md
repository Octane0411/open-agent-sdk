# Autoresearch for Terminal-Bench

This directory adapts the `program.md`-driven workflow popularized by
Karpathy's `autoresearch` project to Open Agent SDK and Terminal-bench.

Start with:

- `benchmark/autoresearch/protocol.md`
- `benchmark/autoresearch/program.md`
- `benchmark/autoresearch/scope.md`
- `benchmark/autoresearch/report-template.md`
- `benchmark/autoresearch/report-template.html`

## Design

- The optimizing agent edits a narrow search surface:
  - `packages/cli/src/index.ts`
  - selected tool descriptions/formatters in `packages/core/src/tools/`
  - `packages/core/src/agent/react-loop.ts`
- The evaluator is fixed:
  - `benchmark/autoresearch/evaluate.sh`
  - Harbor + `terminal-bench@2.0`
  - task list defaults to `benchmark/terminalbench/task-lists/smoke-5.txt`
- Results are append-only in:
  - `benchmark/autoresearch/results.tsv` for experiment-level aggregates
  - `benchmark/autoresearch/results_tasks.tsv` for task-level aggregates

This is similar in spirit to
https://github.com/karpathy/autoresearch:
- immutable benchmark
- narrow editable surface
- repeated keep/revert loop
- a Markdown `program.md` that acts like lightweight org code

## Recommended Loop

1. Create a dedicated experiment branch such as
   `exp/autoresearch-smoke5-run`
2. Read `protocol.md`, `program.md`, and `scope.md`
3. Copy `report-template.html` into a run-specific review file
4. Optionally copy `report-template.md` into a working notes file
5. Make one small hypothesis-driven change
6. Commit it
7. If the OAS code under test changed and you plan to run with `k > 1`,
   pre-warm once:

```bash
bash ./benchmark/terminalbench/prewarm-images.sh \
  --tasks-file ./benchmark/terminalbench/task-lists/smoke-5.txt \
  --pack-local-tarballs \
  --force
```

8. Run:

```bash
bash ./benchmark/autoresearch/run-experiment.sh \
  --tag "<short-label>" \
  --model gpt-5.4 \
  --no-local-tarballs \
  -k 3
```

9. Update the HTML report and experiment tree

10. If you want automatic rollback on regressions:

```bash
bash ./benchmark/autoresearch/run-experiment.sh \
  --tag "<short-label>" \
  --model gpt-5.4 \
  --revert-on-regress
```

The script will:
- run `bun test`
- run `evaluate.sh`
- append a row to `results.tsv`
- append one row per task to `results_tasks.tsv`
- compare the latest row to the previous row
- emit `KEEP` or `REVERT`
- optionally `git reset --hard HEAD~1` while preserving the results log

By default it also:
- packs the current local SDK/CLI into tarballs
- serves them over a temporary local HTTP server
- exports `OAS_LOCAL_TARBALL_URL`

This makes Harbor evaluate the latest local code even when task images are already
pre-warmed. Disable this only if you intentionally want to benchmark the code
already baked into the images:

```bash
bash ./benchmark/autoresearch/run-experiment.sh \
  --tag "<short-label>" \
  --model gpt-5.4 \
  --no-local-tarballs
```

`run-experiment.sh` and `evaluate.sh` require an explicit `--model`. They no
longer fall back to a hidden default, so each experiment row can be traced to
the model you intended to run.

## Cost Control

For Terminal-bench, benchmark cost matters more than in single-metric toy setups.
Use the existing pre-warmed image path under `benchmark/terminalbench/` so
experiments do not repeatedly reinstall Bun and the OAS CLI during agent setup.

For `k > 1`, the default mode should be:

1. pre-warm once
2. run with `--no-local-tarballs`
3. let `run-experiment.sh` patch cached verifier scripts before each run

This avoids repeated OAS installation and repeated `uv` / `pytest` downloads.
`run-experiment.sh` now also fails fast in `--no-local-tarballs` mode if any task
image is missing locally or lacks the expected pre-warmed assets.

## Expected Output

Each campaign should leave behind:

- a dedicated experiment branch
- append-only rows in `results.tsv`
- append-only rows in `results_tasks.tsv`
- a review-ready HTML report copied from `report-template.html`
- optional markdown working notes copied from `report-template.md`
- a Mermaid experiment tree that shows the hypothesis and metrics for each node

## Reading Task Stability

`results_tasks.tsv` includes a compact `statuses` column for each task.

- `P` means one trial passed
- `F` means one trial finished but failed verifier thresholds
- `E` means one trial hit an infrastructure/runtime error

Examples for `k=3`:

- `PPP`: all three trials passed, so the task has `pass@3 = 1` and `pass^3 = 1`
- `PPF`: at least one trial passed but not all, so `pass@3 = 1` and `pass^3 = 0`
- `FFF`: no trial passed, so `pass@3 = 0` and `pass^3 = 0`
- `PPE`: two passes and one infrastructure error
