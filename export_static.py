#!/usr/bin/env python3
"""
Static Export Script for Tokyo Sticker DB
Automates the process of creating a static GitHub Pages version.

Optimized for GitHub Pages: by default it encodes sticker images as WebP
(with transparency preserved) at modest dimensions, which typically shrinks
the exported `docs/` folder by ~60-70% versus the previous PNG/JPEG output.

NOTE: WebP renames files (e.g. `name.png` -> `name.webp`), so the exported
`data.json` paths are remapped to match. If you previously exported with a
different format, clear the old output once before re-exporting:

    rm -rf docs/static && python3 export_static.py
"""

import os
import re
import json
import shutil
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

# Configuration
PROJECT_ROOT = Path(__file__).parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
DOCS_DIR = PROJECT_ROOT / "docs"
STATIC_DIR = DOCS_DIR / "static"

# Image format / compression settings
USE_WEBP = True       # WebP (with alpha) is far smaller than PNG for these stickers
THUMBNAIL_SIZE = 128  # px max dimension for thumbnails (used by grids/maps)
FULL_MAX_SIZE = 512   # px max dimension for full sticker images (modal/zoom)
UPLOAD_MAX_SIZE = 1280  # px max dimension for original uploads (home gallery)

# Quality settings (WebP if USE_WEBP, otherwise JPEG/PNG)
FULL_QUALITY = 80     # quality for full sticker images
THUMB_QUALITY = 72    # quality for thumbnails
UPLOAD_QUALITY = 78   # quality for original uploads


def static_ext(path: str) -> str:
    """Return the path with its extension swapped to the export format."""
    if not USE_WEBP:
        return path
    # Replace only the final extension (handles names like `foo.jpg_sticker_1.png`)
    return re.sub(r"\.[^/.]+$", ".webp", path)


def _has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def load_backend_data():
    """Load cluster results and task metadata."""
    print("📦 Loading backend data...")

    # Load cluster results
    cluster_file = BACKEND_DIR / "cluster_results.json"
    if cluster_file.exists():
        with open(cluster_file) as f:
            clusters = json.load(f)
    else:
        print("  ⚠️  No cluster_results.json found")
        clusters = {"groups": [], "ungrouped": [], "embedding_map": []}

    # Load tasks for metadata
    tasks_file = BACKEND_DIR / "tasks.json"
    if tasks_file.exists():
        with open(tasks_file) as f:
            tasks = json.load(f)
    else:
        print("  ⚠️  No tasks.json found")
        tasks = []

    # Build task lookup by sticker path (keyed by the EXPORTED/static path)
    task_meta = {}

    # Handle both list and dict formats for tasks.json
    task_list = tasks.values() if isinstance(tasks, dict) else tasks

    for task in task_list:
        if not isinstance(task, dict):
            continue

        metadata = task.get("metadata", {})
        for result in task.get("result_paths", []):
            path = result.get("path", "")
            if path:
                task_meta[static_ext(path)] = metadata

    print(f"  ✓ Loaded {len(clusters.get('groups', []))} groups, {len(clusters.get('ungrouped', []))} ungrouped")

    return clusters, task_meta


def _save_optimized(img: Image.Image, dest: Path, quality: int):
    """Save an already-sized PIL image in the configured format."""
    if USE_WEBP:
        img.save(dest, "WEBP", quality=quality, method=6)
    elif dest.suffix.lower() == ".png":
        img.save(dest, "PNG", optimize=True)
    else:
        img.save(dest, "JPEG", quality=quality, optimize=True)


def compress_image(src_path: Path, dest_full: Path, dest_thumb: Path):
    """Compress a single image and create a thumbnail."""
    try:
        with Image.open(src_path) as img:
            # Preserve transparency for stickers; otherwise flatten to RGB.
            img = img.convert("RGBA") if _has_alpha(img) else img.convert("RGB")

            # Full-size (resized down if needed)
            full = img.copy()
            if max(full.size) > FULL_MAX_SIZE:
                full.thumbnail((FULL_MAX_SIZE, FULL_MAX_SIZE), Image.LANCZOS)
            _save_optimized(full, dest_full, FULL_QUALITY)

            # Thumbnail
            thumb = img.copy()
            thumb.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.LANCZOS)
            _save_optimized(thumb, dest_thumb, THUMB_QUALITY)

        return True
    except Exception as e:
        print(f"  ⚠️  Failed to compress {src_path.name}: {e}")
        return False


def copy_and_compress_assets(clusters):
    """Copy and compress sticker images."""
    print("\n🖼️  Compressing and copying sticker images...")

    results_dst = STATIC_DIR / "results"
    thumbs_dst = STATIC_DIR / "thumbs"

    results_dst.mkdir(parents=True, exist_ok=True)
    thumbs_dst.mkdir(parents=True, exist_ok=True)

    # Collect all (original) sticker paths to process
    sticker_paths = set()
    for group in clusters.get("groups", []):
        sticker_paths.update(group.get("sticker_paths", []))
    sticker_paths.update(clusters.get("ungrouped", []))
    for item in clusters.get("embedding_map", []):
        if "path" in item:
            sticker_paths.add(item["path"])

    print(f"  Found {len(sticker_paths)} stickers to process")

    processed = 0
    skipped = 0

    def process_sticker(static_path: str):
        # Source path like /static/results/uuid/filename.png
        rel = static_path.replace("/static/", "")
        src = BACKEND_DIR / "static" / rel

        if not src.exists():
            return None

        # Destination keeps the dir structure but uses the export extension.
        dest_rel = Path(static_ext(rel))
        dest_full = STATIC_DIR / dest_rel

        # Thumbs path: strip leading 'results/' so we get /thumbs/uuid/file
        parts = list(dest_rel.parts)
        dest_thumb_rel = Path(*parts[1:]) if parts and parts[0] == "results" else dest_rel
        dest_thumb = thumbs_dst / dest_thumb_rel

        # Incremental check: skip if both full and thumb already exist
        if dest_full.exists() and dest_thumb.exists():
            return "skipped"

        dest_full.parent.mkdir(parents=True, exist_ok=True)
        dest_thumb.parent.mkdir(parents=True, exist_ok=True)

        if compress_image(src, dest_full, dest_thumb):
            return static_path
        return None

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(process_sticker, p): p for p in sticker_paths}
        for i, future in enumerate(as_completed(futures)):
            result = future.result()
            if result == "skipped":
                skipped += 1
            elif result:
                processed += 1

            if (i + 1) % 500 == 0:
                print(f"    Processed {i + 1}/{len(sticker_paths)}...")

    print(f"  ✓ Compressed {processed} images, {skipped} skipped (already exist)")
    return processed


def _remap_clusters(clusters):
    """Rewrite all sticker paths in cluster data to the exported format."""
    for group in clusters.get("groups", []):
        group["sticker_paths"] = [static_ext(p) for p in group.get("sticker_paths", [])]
    clusters["ungrouped"] = [static_ext(p) for p in clusters.get("ungrouped", [])]
    for item in clusters.get("embedding_map", []):
        if "path" in item:
            item["path"] = static_ext(item["path"])
        # Round coordinates to keep data.json small
        for k in ("x", "y", "z"):
            if isinstance(item.get(k), (int, float)):
                item[k] = round(item[k], 4)
    return clusters


def _remap_tasks(tasks):
    """Rewrite result/upload paths in tasks to the exported format."""
    for task in tasks:
        if not isinstance(task, dict):
            continue
        for r in task.get("result_paths", []):
            if r.get("path"):
                r["path"] = static_ext(r["path"])
    return tasks


def export_data(clusters, task_meta, tasks):
    """Export combined data.json for the static frontend."""
    print("\n📄 Exporting data.json...")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    data = {
        "groups": clusters.get("groups", []),
        "ungrouped": clusters.get("ungrouped", []),
        "total_grouped": clusters.get("total_grouped", 0),
        "total_ungrouped": clusters.get("total_ungrouped", 0),
        "embedding_map": clusters.get("embedding_map", []),
        "task_metadata": task_meta,
        "tasks": tasks,
    }

    with open(DOCS_DIR / "data.json", "w") as f:
        json.dump(data, f, separators=(",", ":"))  # Compact JSON

    print(f"  ✓ Exported data.json ({(DOCS_DIR / 'data.json').stat().st_size / 1024 / 1024:.1f} MB)")


def copy_and_compress_uploads(tasks):
    """Copy and compress original upload images, updating task metadata."""
    print("\n📷 Copying and compressing original uploads...")

    uploads_src = BACKEND_DIR / "static" / "uploads"
    uploads_dst = DOCS_DIR / "static" / "uploads"
    uploads_dst.mkdir(parents=True, exist_ok=True)

    task_list = tasks.values() if isinstance(tasks, dict) else tasks

    # Map filename -> list of tasks referencing it
    file_map = {}
    for task in task_list:
        if isinstance(task, dict) and "image_path" in task:
            fname = Path(task["image_path"]).name
            file_map.setdefault(fname, []).append(task)

    print(f"  Found {len(file_map)} unique uploads to process")

    out_ext = ".webp" if USE_WEBP else None  # None => keep original/JPEG behavior
    processed = 0

    for fname, task_refs in file_map.items():
        src = uploads_src / fname
        if not src.exists():
            continue

        if USE_WEBP:
            new_fname = Path(fname).stem + ".webp"
        else:
            new_fname = Path(fname).stem + ".jpg"
        dest = uploads_dst / new_fname

        # Incremental: skip if already exported
        if not dest.exists():
            try:
                with Image.open(src) as img:
                    img = img.convert("RGBA") if _has_alpha(img) else img.convert("RGB")
                    if max(img.size) > UPLOAD_MAX_SIZE:
                        img.thumbnail((UPLOAD_MAX_SIZE, UPLOAD_MAX_SIZE), Image.LANCZOS)
                    if USE_WEBP:
                        img.save(dest, "WEBP", quality=UPLOAD_QUALITY, method=6)
                    else:
                        if img.mode == "RGBA":
                            bg = Image.new("RGB", img.size, (255, 255, 255))
                            bg.paste(img, mask=img.split()[-1])
                            img = bg
                        img.save(dest, "JPEG", quality=UPLOAD_QUALITY, optimize=True)
                processed += 1
            except Exception as e:
                print(f"  ⚠️  Error processing {fname}: {e}")
                shutil.copy2(src, uploads_dst / fname)
                new_fname = fname

        # Update tasks if name changed
        if new_fname != fname:
            for t in task_refs:
                p = Path(t["image_path"])
                t["image_path"] = str(p.parent / new_fname)

    _ = out_ext  # documentation of intent
    print(f"  ✓ Processed uploads: {processed} compressed")


def build_frontend():
    """Build the React frontend in static mode."""
    print("\n🔨 Building frontend in static mode...")

    result = subprocess.run(
        ["npm", "run", "build:static"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"  ❌ Build failed:\n{result.stderr}")
        return False

    print("  ✓ Frontend built successfully")
    return True


def copy_icon():
    """Copy the icon to docs."""
    icon_src = FRONTEND_DIR / "public" / "icon.png"
    if icon_src.exists():
        shutil.copy(icon_src, DOCS_DIR / "icon.png")
        print("  ✓ Copied icon.png")


def main():
    print("=" * 60)
    print("🚀 Tokyo Sticker DB - Static Export")
    print(f"   Format: {'WebP' if USE_WEBP else 'PNG/JPEG'} | "
          f"sticker<= {FULL_MAX_SIZE}px | thumb<= {THUMBNAIL_SIZE}px | upload<= {UPLOAD_MAX_SIZE}px")
    print("=" * 60)

    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    # Load data (task_meta is keyed by the EXPORTED static path)
    clusters, task_meta = load_backend_data()

    # Re-load tasks for export
    tasks_file = BACKEND_DIR / "tasks.json"
    if tasks_file.exists():
        with open(tasks_file) as f:
            tasks_raw = json.load(f)
    else:
        tasks_raw = []

    tasks_list = list(tasks_raw.values()) if isinstance(tasks_raw, dict) else tasks_raw

    # Compress uploads FIRST (this rewrites task image_path values)
    copy_and_compress_uploads(tasks_list)

    # Compress sticker images (incremental) from the ORIGINAL backend paths
    copy_and_compress_assets(clusters)

    # Remap all paths in the data to the exported format, then write data.json
    _remap_clusters(clusters)
    _remap_tasks(tasks_list)
    export_data(clusters, task_meta, tasks_list)

    # Build frontend
    build_frontend()

    # Copy icon
    copy_icon()

    # Calculate final size
    total_size = sum(f.stat().st_size for f in DOCS_DIR.rglob("*") if f.is_file())

    print("\n" + "=" * 60)
    print(f"✅ Export complete! Total size: {total_size / 1024 / 1024:.1f} MB")
    print(f"📁 Output: {DOCS_DIR}")
    print("\nTo preview locally:")
    print("  npx serve docs")
    print("=" * 60)


if __name__ == "__main__":
    main()
