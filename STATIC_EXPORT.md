ord# Static Export Guide

This document explains how to convert the Tokyo Sticker DB to a static site for GitHub Pages.

## Quick Export

```bash
# From project root
python3 export_static.py
```

This single command will:
1. Load backend data (cluster results, task metadata)
2. Compress and copy original upload images (to JPEG, quality 85)
3. Export `data.json` with all sticker groups and metadata
4. Compress and resize sticker images (max 800px dimension)
5. Generate thumbnails (150px max dimension)
6. Build the React frontend in static mode
7. Copy all assets to `docs/` directory

## Output Structure

```
docs/
├── index.html              # Main entry point
├── icon.png                # App icon
├── data.json               # All sticker/group data
├── assets/                 # Built JS/CSS
└── static/
    ├── uploads/            # Compressed original images (JPEG)
    ├── results/            # Full-size stickers (max 800px)
    └── thumbs/             # Thumbnails (150px max)
```

## Image Compression Settings

Edit these values in `export_static.py` to adjust quality/size:

```python
THUMBNAIL_SIZE = 150   # px max dimension for thumbnails
FULL_MAX_SIZE = 800    # px max dimension for full images
FULL_QUALITY = 85      # JPEG quality for full images
THUMB_QUALITY = 70     # JPEG quality for thumbnails
```

## After Making Changes to Non-Static Site

When you modify the dynamic (non-static) version and want to update the static export:

1. **Make your changes** to the regular frontend/backend
2. **Test locally** with the dynamic backend (`npm run dev` in frontend, `uvicorn` in backend)
3. **Run the export script**: `python3 export_static.py`
4. **Test the static version**: `npx serve docs -p 3333`
5. **Commit and push** the `docs/` folder to GitHub

## Incremental Builds

The export script uses **incremental builds** - it skips images that already exist in `docs/`. To force a full rebuild:

```bash
rm -rf docs/static/thumbs docs/static/results
python3 export_static.py
```

## GitHub Pages Setup

1. Push the `docs/` folder to your repository
2. Go to Settings > Pages
3. Set Source to "Deploy from a branch"
4. Select branch: `main` (or your branch)
5. Select folder: `/docs`
6. Save

Your site will be available at: `https://username.github.io/repository-name/`

## Size Estimates

With 10,000+ stickers:
- **Uploads** (JPEG 85%): ~50-100 MB
- **Full stickers** (800px max): ~200-400 MB
- **Thumbnails** (150px): ~30-50 MB
- **Total**: ~300-600 MB (down from 1.9GB with optimizations)

GitHub Pages has a 1GB limit, so stay within these guidelines.
