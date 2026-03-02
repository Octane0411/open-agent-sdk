#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize SWE-bench report JSON files."
    )
    parser.add_argument(
        "--reports-dir",
        default="benchmark/swebench/outputs/reports",
        help="Directory containing report json files",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Show latest N reports",
    )
    return parser.parse_args()


def load_report(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

    needed = {"total_instances", "resolved_instances", "unresolved_instances", "error_instances"}
    if not needed.issubset(data.keys()):
        return None

    total = data.get("total_instances", 0) or 0
    resolved = data.get("resolved_instances", 0) or 0
    rate = (resolved / total * 100.0) if total else 0.0

    return {
        "file": path.name,
        "mtime": path.stat().st_mtime,
        "total": total,
        "resolved": resolved,
        "unresolved": data.get("unresolved_instances", 0) or 0,
        "error": data.get("error_instances", 0) or 0,
        "resolve_rate": rate,
    }


def main() -> None:
    args = parse_args()
    reports_dir = Path(args.reports_dir)
    if not reports_dir.exists():
        raise SystemExit(f"reports dir not found: {reports_dir}")

    rows = []
    for p in reports_dir.glob("*.json"):
        row = load_report(p)
        if row:
            rows.append(row)

    rows.sort(key=lambda x: x["mtime"], reverse=True)
    rows = rows[: args.limit]

    if not rows:
        print("No valid report json files found.")
        return

    print("Recent SWE-bench runs:")
    print("file,total,resolved,unresolved,error,resolve_rate")
    for r in rows:
        print(
            f"{r['file']},{r['total']},{r['resolved']},{r['unresolved']},{r['error']},{r['resolve_rate']:.1f}%"
        )


if __name__ == "__main__":
    main()
