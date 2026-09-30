"""Extract the evaluation dataset and build larger copies for the scale benchmark.
Usage: python scripts/evaluation/prepare_datasets.py [--sizes 10000 100000 500000 1000000]"""
import argparse
import csv
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ZIP_PATH = os.path.join(ROOT, "data", "evaluation", "student_course_score_evaluation_dataset.zip")
ORIGINAL_DIR = os.path.join(ROOT, "data", "evaluation", "original")
SCALE_DIR = os.path.join(ROOT, "data", "evaluation", "scale")
OFFSET = 1_000_000
SHIFTED = ("dirty_row_id", "record_id", "student_id")


def extract_originals(zip_path=ZIP_PATH, out_dir=ORIGINAL_DIR):
    os.makedirs(out_dir, exist_ok=True)
    written = []
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if name.endswith(".csv"):
                target = os.path.join(out_dir, os.path.basename(name))
                with z.open(name) as src, open(target, "wb") as dst:
                    dst.write(src.read())
                written.append(target)
    return written


def _shift(row, copy_index):
    if copy_index == 0:
        return dict(row)
    out = dict(row)
    for col in SHIFTED:
        if col in out and str(out[col]).strip().isdigit():
            out[col] = str(int(out[col]) + copy_index * OFFSET)
    return out


def scale_dataset(dirty_rows, gt_rows, target):
    rows, gt, copy_index = [], [], 0
    while len(rows) < target:
        for d, g in zip(dirty_rows, gt_rows):
            if len(rows) == target:
                break
            rows.append(_shift(d, copy_index))
            gt.append(_shift(g, copy_index))
        copy_index += 1
    return rows, gt


def _read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sizes", nargs="*", type=int, default=[10000, 100000, 500000, 1000000])
    args = parser.parse_args()
    for path in extract_originals():
        print("extracted", os.path.relpath(path, ROOT))
    dirty = _read(os.path.join(ORIGINAL_DIR, "dirty_dataset.csv"))
    gt = _read(os.path.join(ORIGINAL_DIR, "ground_truth.csv"))
    os.makedirs(SCALE_DIR, exist_ok=True)
    for n in args.sizes:
        rows, g = scale_dataset(dirty, gt, n)
        _write(os.path.join(SCALE_DIR, f"dirty_{n}.csv"), rows)
        _write(os.path.join(SCALE_DIR, f"ground_truth_{n}.csv"), g)
        print(f"scale {n}: {len(rows)} rows")


if __name__ == "__main__":
    main()
