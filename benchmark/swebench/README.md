# SWE-bench Smoke Test (Lite)

This directory is for local SWE-bench experiments in this repository.

## Goal

Run one `SWE-bench Lite` instance end-to-end as a smoke test:

1. Generate a local `predictions.jsonl` for one Lite instance (using dataset gold patch).
2. Run `swebench.harness.run_evaluation` on that single instance.

## Setup

From repo root:

```bash
python3 -m venv .venv-swebench
. .venv-swebench/bin/activate
pip install -U pip
pip install swebench datasets
```

## Run One-Instance Smoke Test

```bash
cd benchmark/swebench
./scripts/run_smoke_one.sh
```

Optional timeout override:

```bash
SWEBENCH_TIMEOUT=300 ./scripts/run_smoke_one.sh
```

## Run One-Instance OAS Smoke Test

This path calls Open Agent SDK CLI to generate `model_patch` from the SWE-bench task, then runs harness.

Required env:

```bash
export OAS_MODEL="<your-model>"
# Optional:
# export OAS_PROVIDER="openai|anthropic|google"
# export OAS_BASE_URL="https://..."
```

Run:

```bash
cd benchmark/swebench
./scripts/run_oas_smoke_one.sh
```

Optional overrides:

```bash
SWEBENCH_INSTANCE_ID="astropy__astropy-12907" OAS_MAX_TURNS=40 SWEBENCH_TIMEOUT=600 ./scripts/run_oas_smoke_one.sh
```

Artifacts are written to:

- `benchmark/swebench/outputs/predictions/`
- `benchmark/swebench/outputs/reports/`

## Notes

- This smoke test validates harness plumbing without calling external model APIs.
- For real model benchmarking, replace the prediction generation step with your model-produced `model_patch`.
