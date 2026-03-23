# Autoresearch for Terminal-Bench

This directory adapts the `program.md`-driven workflow popularized by
Karpathy's `autoresearch` project to Open Agent SDK and Terminal-bench.

## Design

- The optimizing agent edits a narrow search surface:
  - `packages/cli/src/index.ts`
  - selected tool descriptions/formatters in `packages/core/src/tools/`
  - `packages/core/src/agent/react-loop.ts`
- The evaluator is fixed:
  - `benchmark/autoresearch/evaluate.sh`
  - Harbor + `terminal-bench@2.0`
  - task list defaults to `benchmark/terminalbench/task-lists/smoke-5.txt`
- Results are append-only in `benchmark/autoresearch/results.tsv`

This is similar in spirit to
https://github.com/karpathy/autoresearch:
- immutable benchmark
- narrow editable surface
- repeated keep/revert loop
- a Markdown `program.md` that acts like lightweight org code

## Recommended Loop

1. Read `program.md` and `scope.md`
2. Make one small hypothesis-driven change
3. Commit it
4. Run:

```bash
bash ./benchmark/autoresearch/run-experiment.sh --tag "<short-label>"
```

5. If you want automatic rollback on regressions:

```bash
bash ./benchmark/autoresearch/run-experiment.sh \
  --tag "<short-label>" \
  --revert-on-regress
```

The script will:
- run `bun test`
- run `evaluate.sh`
- append a row to `results.tsv`
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
  --no-local-tarballs
```

## Cost Control

For Terminal-bench, benchmark cost matters more than in single-metric toy setups.
Use the existing pre-warmed image path under `benchmark/terminalbench/` so
experiments do not repeatedly reinstall Bun and the OAS CLI during agent setup.
