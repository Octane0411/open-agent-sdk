#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from datasets import load_dataset


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate one SWE-bench Lite prediction using dataset gold patch."
    )
    parser.add_argument(
        "--dataset",
        default="princeton-nlp/SWE-bench_Lite",
        help="HuggingFace dataset name",
    )
    parser.add_argument(
        "--split",
        default="test",
        help="Dataset split",
    )
    parser.add_argument(
        "--instance-id",
        default=None,
        help="Target instance_id. If omitted, use first record in split.",
    )
    parser.add_argument(
        "--model-name",
        default="gold-smoke",
        help="model_name_or_path value in predictions file",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output predictions.jsonl path",
    )
    args = parser.parse_args()

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

    pred = {
        "instance_id": row["instance_id"],
        "model_name_or_path": args.model_name,
        "model_patch": row["patch"],
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(pred, ensure_ascii=True) + "\n", encoding="utf-8")

    print(f"instance_id={row['instance_id']}")
    print(f"output={out}")


if __name__ == "__main__":
    main()
