#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import shutil
from pathlib import Path

from datasets import load_dataset


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> str:
    result = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(cmd)}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
    return result.stdout


def ensure_repo_at_commit(repo_full_name: str, base_commit: str, repo_dir: Path) -> None:
    repo_url = f"https://github.com/{repo_full_name}.git"
    if not (repo_dir / ".git").exists():
        repo_dir.mkdir(parents=True, exist_ok=True)
        run(["git", "init"], cwd=repo_dir)
        run(["git", "remote", "add", "origin", repo_url], cwd=repo_dir)
    else:
        remotes = run(["git", "remote"], cwd=repo_dir).splitlines()
        if "origin" not in remotes:
            run(["git", "remote", "add", "origin", repo_url], cwd=repo_dir)

    run(["git", "fetch", "--depth", "1", "origin", base_commit], cwd=repo_dir)
    run(["git", "checkout", "-f", base_commit], cwd=repo_dir)
    run(["git", "clean", "-fdx"], cwd=repo_dir)
    run(["git", "reset", "--hard", base_commit], cwd=repo_dir)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate one SWE-bench Lite prediction by running Open Agent SDK CLI."
    )
    parser.add_argument("--dataset", default="princeton-nlp/SWE-bench_Lite")
    parser.add_argument("--split", default="test")
    parser.add_argument("--instance-id", default=None)
    parser.add_argument("--output", required=True)
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument(
        "--provider",
        choices=["openai", "anthropic", "google"],
        default=None,
    )
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--max-turns", type=int, default=30)
    parser.add_argument("--trajectory-dir", required=True)
    parser.add_argument("--logs-dir", required=True)
    return parser.parse_args()

def find_session_jsonl(session_id: str) -> tuple[Path | None, Path | None]:
    home = Path.home()
    direct = home / ".open-agent" / "sessions" / f"{session_id}.jsonl"
    if direct.exists():
        return direct, direct.parent

    projects_root = home / ".open-agent" / "projects"
    if projects_root.exists():
        matches = list(projects_root.glob(f"*/{session_id}.jsonl"))
        if matches:
            return matches[0], matches[0].parent

    return None, None


def main() -> None:
    args = parse_args()

    ds = load_dataset(args.dataset, split=args.split)
    row = None
    if args.instance_id:
        for item in ds:
            if item["instance_id"] == args.instance_id:
                row = item
                break
        if row is None:
            raise SystemExit(f"instance_id not found: {args.instance_id}")
    else:
        row = ds[0]

    instance_id = row["instance_id"]
    repo_full_name = row["repo"]
    base_commit = row["base_commit"]
    problem_statement = row["problem_statement"]

    workspace_root = Path(args.workspace_root)
    repo_root = Path(args.repo_root)
    repo_dir = workspace_root / instance_id / "repo"
    trajectory_dir = Path(args.trajectory_dir)
    trajectory_dir.mkdir(parents=True, exist_ok=True)
    trajectory_file = trajectory_dir / f"{instance_id}.trajectory.json"
    logs_dir = Path(args.logs_dir) / instance_id / "open-agent-transcript"
    logs_dir.mkdir(parents=True, exist_ok=True)

    ensure_repo_at_commit(repo_full_name, base_commit, repo_dir)

    prompt = (
        "You are solving a SWE-bench task.\n\n"
        f"Repository: {repo_full_name}\n"
        f"Base commit: {base_commit}\n"
        f"Instance ID: {instance_id}\n\n"
        "Task:\n"
        f"{problem_statement}\n\n"
        "Requirements:\n"
        "- Modify code in this repository to address the task.\n"
        "- Run focused verification where feasible.\n"
        "- Keep changes minimal and correct.\n"
        "- When complete, summarize what changed.\n"
    )

    cli_cwd = repo_root / "packages" / "cli"
    cmd = [
        "bun",
        "run",
        "src/index.ts",
        "-p",
        prompt,
        "--model",
        args.model,
        "--output-format",
        "json",
        "--max-turns",
        str(args.max_turns),
        "--cwd",
        str(repo_dir),
        "--save-trajectory",
        str(trajectory_file),
    ]
    if args.provider:
        cmd.extend(["--provider", args.provider])
    if args.base_url:
        cmd.extend(["--base-url", args.base_url])

    run_env = os.environ.copy()
    cli_stdout = run(cmd, cwd=cli_cwd, env=run_env)
    cli_payload = json.loads(cli_stdout)
    if "error" in cli_payload:
        raise RuntimeError(f"OAS CLI returned error: {cli_payload['error']}")
    session_id = cli_payload.get("session_id")

    patch = run(["git", "diff", "--binary"], cwd=repo_dir)
    prediction = {
        "instance_id": instance_id,
        "model_name_or_path": args.model,
        "model_patch": patch,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(prediction, ensure_ascii=True) + "\n", encoding="utf-8")

    transcript_file = None
    sessions_index_file = None
    if session_id:
        session_jsonl, session_parent = find_session_jsonl(session_id)
        if session_jsonl and session_jsonl.exists():
            transcript_file = logs_dir / f"{session_id}.jsonl"
            shutil.copy2(session_jsonl, transcript_file)
        if session_parent:
            maybe_index = session_parent / "sessions-index.json"
            if maybe_index.exists():
                sessions_index_file = logs_dir / "sessions-index.json"
                shutil.copy2(maybe_index, sessions_index_file)

    metadata = {
        "instance_id": instance_id,
        "repo": repo_full_name,
        "base_commit": base_commit,
        "session_id": session_id,
        "prediction_file": str(output_path),
        "trajectory_file": str(trajectory_file),
        "transcript_file": str(transcript_file) if transcript_file else None,
        "sessions_index_file": str(sessions_index_file) if sessions_index_file else None,
        "transcript_dir": str(logs_dir),
        "patch_bytes": len(patch.encode("utf-8")),
    }
    (trajectory_dir / f"{instance_id}.metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(metadata, ensure_ascii=True))


if __name__ == "__main__":
    main()
