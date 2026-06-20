#!/usr/bin/env python3
"""
graffiti_yolo_scan.py — Step 1: Run YOLO on all cube faces

Scans all cube face images with YOLO and saves detections to yolo_detections.json.
Fast, free, runs entirely on local GPU. No API calls.

Usage:
    python graffiti_yolo_scan.py ^
        --input Graffiti\Video1\Cubeface ^
        --model C:/Windows/System32/sgblur/runs/detect/graffiti-18/weights/best.pt ^
        --output Graffiti\Output ^
        --track Video1

    # Append Video2:
    python graffiti_yolo_scan.py ^
        --input Graffiti\Video2\Cubeface ^
        --model C:/Windows/System32/sgblur/runs/detect/graffiti-18/weights/best.pt ^
        --output Graffiti\Output ^
        --track Video2 ^
        --append
"""

import os, re, sys, json, argparse
from pathlib import Path

FACE_LABELS = ["front", "right", "back", "left", "up", "down"]
YOLO_CONF   = 0.25


def group_cube_faces(input_dir):
    groups = {}
    for path in sorted(Path(input_dir).iterdir()):
        m = re.match(r'^(.+)_([0-5])(\.[a-zA-Z]+)$', path.name)
        if not m:
            continue
        base, idx = m.group(1), int(m.group(2))
        if base not in groups:
            groups[base] = [None]*6
        groups[base][idx] = str(path)
    return {k: v for k, v in groups.items() if any(v)}


def main():
    parser = argparse.ArgumentParser(description="Step 1: YOLO scan all cube faces")
    parser.add_argument("--input",  required=True,          help="Cube face images folder")
    parser.add_argument("--model",  required=True,          help="Path to trained YOLO best.pt")
    parser.add_argument("--output", default="./output",     help="Output folder")
    parser.add_argument("--track",  default="",             help="Track name e.g. Video1")
    parser.add_argument("--conf",   type=float, default=YOLO_CONF, help="Confidence threshold")
    parser.add_argument("--limit",  type=int, default=None, help="Limit locations for testing")
    parser.add_argument("--append", action="store_true",    help="Append to existing detections")
    args = parser.parse_args()

    input_dir  = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_dir.exists():
        sys.exit(f"Error: folder not found: {input_dir}")
    if not Path(args.model).exists():
        sys.exit(f"Error: model not found: {args.model}")

    try:
        from ultralytics import YOLO
    except ImportError:
        sys.exit("Missing: pip install ultralytics")

    print(f"\nRando360 — YOLO Scanner (Step 1)")
    print(f"{'='*40}")
    print(f"Input:  {input_dir}")
    print(f"Model:  {args.model}")
    print(f"Output: {output_dir}")
    print(f"Track:  {args.track or 'default'}")
    print(f"Conf:   {args.conf}")
    print(f"{'='*40}\n")

    # Load model once
    print("Loading YOLO model...")
    model = YOLO(args.model)
    print("Model loaded\n")

    # Group cube faces
    groups = group_cube_faces(input_dir)
    print(f"Found {len(groups)} locations")

    # Create annotations folder for training data
    annotations_dir = output_dir / "annotations"
    annotations_dir.mkdir(parents=True, exist_ok=True)
    print(f"Annotations will be saved to: {annotations_dir}")

    items = sorted(groups.items(), key=lambda x: int(re.search(r'(\d+)$', x[0]).group(1)) if re.search(r'(\d+)$', x[0]) else 0)
    if args.limit:
        items = items[:args.limit]
        print(f"Test mode: processing first {args.limit} locations\n")

    detections   = {}
    hit_count    = 0
    clean_count  = 0

    for i, (base_name, face_paths) in enumerate(items):
        location_detections = {}

        for idx, path in enumerate(face_paths):
            if not path or not Path(path).exists():
                continue
            face_label = FACE_LABELS[idx]
            # Skip up and down faces — no graffiti there
            if face_label in ("up", "down"):
                continue

            results = model(path, conf=args.conf, verbose=False)
            if results and results[0].boxes and len(results[0].boxes) > 0:
                boxes = []
                for box in results[0].boxes:
                    xywhn = box.xywhn[0].tolist()
                    conf_score = float(box.conf[0])
                    cls = int(box.cls[0])
                    boxes.append({
                        "bbox":  xywhn,
                        "conf":  round(conf_score, 3),
                        "class": cls,
                        "path":  path
                    })
                location_detections[face_label] = boxes

        if location_detections:
            hit_count += 1
            detections[base_name] = {
                "base_name": base_name,
                "track":     args.track,
                "faces":     location_detections
            }
            # Save YOLO annotation .txt files for future training
            for face_label, boxes in location_detections.items():
                if not boxes:
                    continue
                face_path = boxes[0].get("path", "")
                if not face_path:
                    continue
                stem     = Path(face_path).stem
                txt_path = annotations_dir / f"{stem}.txt"
                with open(txt_path, "w") as tf:
                    for box in boxes:
                        xc, yc, bw, bh = box["bbox"]
                        tf.write(f"0 {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}\n")

            faces_str = ", ".join([f"{f}:{len(b)}" for f, b in location_detections.items()])
            print(f"  [{i+1}/{len(items)}] {base_name} — graffiti on: {faces_str}")
        else:
            clean_count += 1
            if (i+1) % 50 == 0:
                print(f"  [{i+1}/{len(items)}] processed... ({hit_count} with graffiti)")

    # Save detections
    output_path = output_dir / "yolo_detections.json"

    if args.append and output_path.exists():
        existing = json.load(open(output_path, encoding="utf-8"))
        # Remove existing entries for this track
        if args.track:
            existing = {k: v for k, v in existing.items() if v.get("track") != args.track}
        existing.update(detections)
        detections = existing

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(detections, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*40}")
    print(f"YOLO SCAN COMPLETE")
    print(f"{'='*40}")
    print(f"Total locations:  {len(items)}")
    print(f"With graffiti:    {hit_count} ({round(hit_count/max(len(items),1)*100)}%)")
    print(f"Clean (skipped):  {clean_count}")
    print(f"Saved:            {output_path}")
    print(f"Annotations:      {annotations_dir} ({hit_count} faces annotated)")
    print(f"\nNext step:")
    print(f"  python graffiti_claude_classify.py --json {output_path} --pano Graffiti\\Video1\\360Photos --output {output_dir} --city \"Grenoble\"")
    print(f"{'='*40}\n")


if __name__ == "__main__":
    main()
