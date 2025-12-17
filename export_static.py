#!/usr/bin/env python3
"""
Static Export Script for Tokyo Sticker DB
Automates the process of creating a static GitHub Pages version.
"""

import os
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

# Image compression settings
THUMBNAIL_SIZE = 150  # px max dimension for thumbnails
FULL_MAX_SIZE = 600   # px max dimension for full images (reduces 3MB files to ~100KB)
FULL_QUALITY = 75     # JPEG quality for full images
THUMB_QUALITY = 65    # JPEG quality for thumbnails


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
    
    # Build task lookup by sticker path
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
                task_meta[path] = metadata
    
    print(f"  ✓ Loaded {len(clusters.get('groups', []))} groups, {len(clusters.get('ungrouped', []))} ungrouped")
    
    return clusters, task_meta


def compress_image(src_path: Path, dest_full: Path, dest_thumb: Path):
    """Compress a single image and create thumbnail."""
    try:
        with Image.open(src_path) as img:
            # Resize if larger than max size
            if max(img.size) > FULL_MAX_SIZE:
                img.thumbnail((FULL_MAX_SIZE, FULL_MAX_SIZE), Image.LANCZOS)
            
            # Convert RGBA to RGB with white background for JPEG, or keep PNG
            if src_path.suffix.lower() == '.png':
                # For PNGs with transparency, keep as PNG but compress
                if img.mode == 'RGBA':
                    # Save full PNG (lossless but optimized, resized)
                    img.save(dest_full, 'PNG', optimize=True)
                    # Create thumbnail
                    img_thumb = img.copy()
                    img_thumb.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.LANCZOS)
                    img_thumb.save(dest_thumb, 'PNG', optimize=True)
                else:
                    img.save(dest_full, 'PNG', optimize=True)
                    img_thumb = img.copy()
                    img_thumb.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.LANCZOS)
                    img_thumb.save(dest_thumb, 'PNG', optimize=True)
            else:
                # Convert to JPEG for non-transparent images
                if img.mode in ('RGBA', 'P'):
                    bg = Image.new('RGB', img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = bg
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                img.save(dest_full, 'JPEG', quality=FULL_QUALITY, optimize=True)
                img_thumb = img.copy()
                img_thumb.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.LANCZOS)
                img_thumb.save(dest_thumb, 'JPEG', quality=THUMB_QUALITY, optimize=True)
        
        return True
    except Exception as e:
        print(f"  ⚠️  Failed to compress {src_path.name}: {e}")
        return False


def copy_and_compress_assets(clusters):
    """Copy and compress sticker images."""
    print("\n🖼️  Compressing and copying sticker images...")
    
    results_src = BACKEND_DIR / "static" / "results"
    results_dst = STATIC_DIR / "results"
    thumbs_dst = STATIC_DIR / "thumbs"
    
    results_dst.mkdir(parents=True, exist_ok=True)
    thumbs_dst.mkdir(parents=True, exist_ok=True)
    
    # Collect all sticker paths
    sticker_paths = set()
    for group in clusters.get("groups", []):
        sticker_paths.update(group.get("sticker_paths", []))
    sticker_paths.update(clusters.get("ungrouped", []))
    
    # Also include paths from embedding_map
    for item in clusters.get("embedding_map", []):
        if "path" in item:
            sticker_paths.add(item["path"])
    
    print(f"  Found {len(sticker_paths)} stickers to process")
    
    # Process images in parallel
    processed = 0
    failed = 0
    
    def process_sticker(static_path: str):
        # Path like /static/results/uuid/filename.png
        rel = static_path.replace("/static/", "")
        src = BACKEND_DIR / "static" / rel
        
        if not src.exists():
            return None
            
        # Maintain directory structure
        dest_rel = Path(rel)
        dest_full = STATIC_DIR / dest_rel
        
        # Thumbs path: Strip 'results/' prefix if present so we get /thumbs/uuid/file
        # rel is typically "results/uuid/filename"
        parts = list(dest_rel.parts)
        if parts[0] == 'results':
            dest_thumb_rel = Path(*parts[1:])
        else:
            dest_thumb_rel = dest_rel
            
        dest_thumb = thumbs_dst / dest_thumb_rel
        
        # Incremental check: Skip if both full and thumb exist
        if dest_full.exists() and dest_thumb.exists():
             return None # Already processed
        
        dest_full.parent.mkdir(parents=True, exist_ok=True)
        dest_thumb.parent.mkdir(parents=True, exist_ok=True)
        
        if compress_image(src, dest_full, dest_thumb):
            return static_path
        return None
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(process_sticker, p): p for p in sticker_paths}
        for i, future in enumerate(as_completed(futures)):
            result = future.result()
            if result:
                processed += 1
            else:
                failed += 1
            
            # Progress indicator
            if (i + 1) % 500 == 0:
                print(f"    Processed {i + 1}/{len(sticker_paths)}...")
    
    print(f"  ✓ Compressed {processed} images, {failed} failed")
    return processed


def export_data(clusters, task_meta, tasks):
    """Export combined data.json for the static frontend."""
    print("\n📄 Exporting data.json...")
    
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Create combined data structure
    data = {
        "groups": clusters.get("groups", []),
        "ungrouped": clusters.get("ungrouped", []),
        "total_grouped": clusters.get("total_grouped", 0),
        "total_ungrouped": clusters.get("total_ungrouped", 0),
        "embedding_map": clusters.get("embedding_map", []),
        "task_metadata": task_meta,
        "tasks": tasks
    }
    
    with open(DOCS_DIR / "data.json", "w") as f:
        json.dump(data, f, separators=(',', ':'))  # Compact JSON
    
    print(f"  ✓ Exported data.json ({(DOCS_DIR / 'data.json').stat().st_size / 1024 / 1024:.1f} MB)")


def copy_and_compress_uploads(tasks):
    """Copy and compress original upload images, updating task metadata."""
    print("\n📷 Copying and compressing original uploads...")
    
    uploads_src = BACKEND_DIR / "static" / "uploads"
    uploads_dst = DOCS_DIR / "static" / "uploads"
    uploads_dst.mkdir(parents=True, exist_ok=True)
    
    task_list = tasks.values() if isinstance(tasks, dict) else tasks
    
    # 1. Identify files and their tasks
    file_map = {} # filename -> list of tasks
    for task in task_list:
        if isinstance(task, dict) and "image_path" in task:
            fname = Path(task["image_path"]).name
            if fname not in file_map:
                file_map[fname] = []
            file_map[fname].append(task)
            
    print(f"  Found {len(file_map)} unique uploads to process")
    
    copied = 0
    converted = 0
    
    for fname, task_refs in file_map.items():
        src = uploads_src / fname
        if not src.exists():
            continue
            
        final_fname = fname
        
        try:
            with Image.open(src) as img:
                is_transparent = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
                
                if is_transparent:
                    # Copy as is
                    shutil.copy2(src, uploads_dst / fname)
                    copied += 1
                else:
                    # Convert to JPEG
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    new_fname = Path(fname).stem + ".jpg"
                    dest = uploads_dst / new_fname
                    img.save(dest, "JPEG", quality=FULL_QUALITY, optimize=True)
                    final_fname = new_fname
                    converted += 1
        except Exception as e:
            print(f"  ⚠️  Error processing {fname}: {e}")
            shutil.copy2(src, uploads_dst / fname)
            copied += 1
            
        # Update tasks if name changed
        if final_fname != fname:
            for t in task_refs:
                # Update image_path. Assumes /static/uploads/ structure constant.
                # Only replace filename at end.
                p = Path(t["image_path"])
                new_path = p.parent / final_fname
                t["image_path"] = str(new_path)
                
    print(f"  ✓ Processed uploads: {copied} copied, {converted} compressed to JPEG")


def build_frontend():
    """Build the React frontend in static mode."""
    print("\n🔨 Building frontend in static mode...")
    
    # Run npm build with static config
    result = subprocess.run(
        ["npm", "run", "build:static"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True
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
    print("=" * 60)
    
    # Ensure docs dir exists (Incremental: don't delete if exists)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load data
    clusters, task_meta = load_backend_data()
    
    # Re-load tasks for export
    tasks_file = BACKEND_DIR / "tasks.json"
    if tasks_file.exists():
        with open(tasks_file) as f:
            tasks_raw = json.load(f)
    else:
        tasks_raw = []
    
    # Convert tasks to list if it's a dict (backend format)
    if isinstance(tasks_raw, dict):
        tasks_list = list(tasks_raw.values())
    else:
        tasks_list = tasks_raw
    
    # Copy and compress uploads FIRST (so metadata updates)
    copy_and_compress_uploads(tasks_list)
    
    # Export data.json (including tasks with updated paths)
    export_data(clusters, task_meta, tasks_list)

    # Copy and compress images (incremental)
    copy_and_compress_assets(clusters)
    
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
