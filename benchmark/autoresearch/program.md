# Autoresearch: Agent Performance Optimization

You are an AI researcher optimizing the open-agent-sdk's performance on terminal-bench.

Before doing anything else, read:

1. `benchmark/autoresearch/protocol.md`
2. `benchmark/autoresearch/scope.md`
3. `benchmark/autoresearch/results.tsv` if it exists
4. the current campaign report copied from `benchmark/autoresearch/report-template.md`

**Primary goal:** maximize **pass@k** (capability — can the agent solve each task at all?)
**Secondary goal:** maximize **pass^k** (reliability — does it solve tasks consistently?)
**Constraint:** the gap `pass@k - pass^k` should shrink over time (consistency improves).

## Metrics

| Metric | Definition | Measures |
|--------|-----------|----------|
| pass@k | Fraction of tasks with ≥1 success in k trials | Capability ceiling |
| pass^k | Fraction of tasks with k/k successes | Reliability floor |
| avg_trial_rate | Total passes / total trials | Raw per-trial accuracy |
| consistency gap | pass@k - pass^k | How much performance varies |

When k=1, all metrics collapse to the same number (simple pass rate).

## Setup

1. Read the current state of all modifiable files listed in `scope.md`.
2. Work on a dedicated experiment branch such as `exp/autoresearch-smoke5-run`.
3. Make sure the campaign report exists and will be updated after each run.
4. Run a **baseline evaluation**:
   ```bash
   bash ./benchmark/autoresearch/run-experiment.sh \
     --tag E0-baseline \
     --no-local-tarballs \
     -k 3
   ```
5. Review the baseline numbers before proceeding.

## Experiment Loop

Repeat the following until the human stops the campaign.

### Step 1: Hypothesize

Based on:
- The current code (system prompt, tool descriptions, react loop)
- Past experiment results in `results.tsv`
- Your knowledge of what makes agents effective at terminal tasks

Formulate a **single, testable hypothesis**. Examples:
- "Adding a 'verify your work' instruction to the system prompt will reduce incomplete solutions"
- "Making the Bash tool description mention stderr handling will help the agent debug failures"
- "Reducing MAX_CAPTURE_CHARS will force the agent to be more targeted with commands"
- "Adding a guideline about reading error messages before retrying will reduce wasted turns"

Write your hypothesis into:

- the git commit message
- the campaign report
- the Mermaid experiment tree node label

### Step 2: Implement

Make the **minimal change** to test your hypothesis. Rules:
- Only modify files listed in `scope.md` under "Modifiable Files"
- Change **one thing at a time** — if you change both the system prompt and a tool description, you can't attribute the result
- Keep changes small and reversible

### Step 3: Validate

Run tests to make sure you haven't broken anything:
```bash
bun test
```

If tests fail, fix your change or revert. Do NOT proceed to evaluation with broken tests.

### Step 4: Commit

```bash
git add -A
git commit -m "experiment: <description of what you changed and why>"
```

### Step 5: Evaluate

Preferred:
```bash
bash ./benchmark/autoresearch/run-experiment.sh \
  --tag "<short-label>" \
  --no-local-tarballs \
  -k 3
```

Manual fallback:
```bash
./benchmark/autoresearch/evaluate.sh -k 3 --tag "<short-label>" --output benchmark/autoresearch/results.tsv
```

Wait for it to complete. The scripts output pass@k, pass^k, and avg_trial_rate.

If the code under test changed in a way that affects the installed OAS SDK or
CLI behavior, pre-warm the images once before running the command above:

```bash
bash ./benchmark/terminalbench/prewarm-images.sh \
  --tasks-file ./benchmark/terminalbench/task-lists/smoke-5.txt \
  --pack-local-tarballs \
  --force
```

### Step 6: Analyze & Decide

Read the results and compare against the previous baseline in `results.tsv`.

**Keep the commit if ANY of these are true:**
- pass@k improved (≥1 more task solvable)
- pass^k improved while pass@k held steady (reliability gain)
- consistency gap narrowed significantly

**Revert if:**
- pass@k decreased (lost capability)
- pass^k decreased AND pass@k didn't improve (net negative)

To revert manually:
```bash
git reset --hard HEAD~1
```

If you use the helper script below, it can decide and revert automatically:
```bash
bash ./benchmark/autoresearch/run-experiment.sh --tag "<short-label>" --revert-on-regress
```

Record failed experiments in `results.tsv` anyway — append `[REVERTED]` to the description.
Also record them in the campaign report and Mermaid tree.

**Prioritization:**
- Early experiments: focus on **pass@k** (unlock new tasks)
- Later experiments: focus on **pass^k** (make solved tasks reliable)
- A change that improves pass@k but hurts pass^k is still valuable early on
- A change that hurts pass@k is almost never acceptable

## Rules

1. **Do not mix infrastructure work with experiment work.** Harness changes go on
   a separate branch from experiment runs.
2. **Use a dedicated experiment branch.** Keep only winning code commits there.
3. **Always update the report.** The report and Mermaid tree are mandatory
   outputs, not optional notes.
4. **Do not lose reverted experiments.** Reverted code commits can disappear from
   branch history, but their metrics and notes must remain in the report and
   `results.tsv`.
5. **Never modify read-only files** listed in scope.md.
6. **Never modify this file** (program.md), evaluate.sh, scope.md, or results.tsv format.
7. **Never add dependencies** to package.json.
8. **Always run tests** before evaluation. Broken code wastes an expensive evaluation cycle.
9. **One variable per experiment.** Multi-variable changes make results uninterpretable.
10. **Log everything.** Even failed experiments are valuable data — they narrow the search space.
11. **Weigh complexity vs. improvement.** A 1% gain that adds 50 lines of code is probably not worth it. A 10% gain that adds 50 lines might be.

## What to Try (Ordered by Expected Impact)

### High Impact
- System prompt structure: task decomposition instructions, verification steps, error handling guidance
- Tool descriptions: help the LLM understand when and how to use each tool
- System prompt examples: show patterns for common terminal tasks

### Medium Impact
- Output formatting: how tool results are presented back to the LLM
- Context management: what gets kept vs. compacted in long conversations
- Turn budgeting: instructions about pacing and when to wrap up

### Lower Impact (try after exhausting above)
- Parameter tuning: maxTurns, timeouts, truncation limits
- Tool parameter descriptions: help the LLM provide better inputs
- Negative instructions: explicitly telling the LLM what NOT to do

## Understanding Terminal-Bench Tasks

Terminal-bench tasks require the agent to:
- Read task instructions and understand the goal
- Navigate a filesystem, read/write files, run shell commands
- Install dependencies, compile code, run tests
- Debug failures by reading error output
- Produce a correct result that passes automated verification

Common failure modes (these hurt pass^k — solving them improves reliability):
- Agent doesn't verify its work before declaring done
- Agent retries the same failing command instead of diagnosing the error
- Agent runs out of turns before completing the task
- Agent misunderstands the task requirements
- Agent uses wrong tool (e.g., Bash when Read would be more appropriate)

## Reading Results

When analyzing `results.tsv`, look for patterns:

- **High pass@k, low pass^k:** Agent CAN solve it but is inconsistent. Fix: improve prompting clarity, reduce ambiguity in tool descriptions.
- **Low pass@k, low pass^k:** Agent fundamentally struggles. Fix: add new capabilities, better system prompt guidance.
- **Both high:** Task is solved reliably. Move on to harder tasks.
- **pass@k dropped after a change:** You broke something. Revert immediately.
