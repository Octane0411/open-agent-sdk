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
    parser.add_argument(
        "--format",
        choices=["table", "markdown", "csv"],
        default="table",
        help="Output format",
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
        "empty_patch": data.get("empty_patch_instances", 0) or 0,
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

    headers = ["file", "total", "resolved", "unresolved", "empty_patch", "error", "resolve_rate"]
    values = [
        [
            r["file"],
            str(r["total"]),
            str(r["resolved"]),
            str(r["unresolved"]),
            str(r["empty_patch"]),
            str(r["error"]),
            f"{r['resolve_rate']:.1f}%",
        ]
        for r in rows
    ]

    print("Recent SWE-bench runs:")
    if args.format == "csv":
        print(",".join(headers))
        for row in values:
            print(",".join(row))
        return

    if args.format == "markdown":
        print("| " + " | ".join(headers) + " |")
        print("| " + " | ".join(["---"] * len(headers)) + " |")
        for row in values:
            print("| " + " | ".join(row) + " |")
        return

    widths = [len(h) for h in headers]
    for row in values:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))

    def fmt_row(row: list[str]) -> str:
        return " | ".join(cell.ljust(widths[i]) for i, cell in enumerate(row))

    print(fmt_row(headers))
    print("-+-".join("-" * w for w in widths))
    for row in values:
        print(fmt_row(row))


if __name__ == "__main__":
    main()
