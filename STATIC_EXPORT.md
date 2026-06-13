ord# Static Export Guide

This document explains how to convert the Tokyo Sticker DB to a static site for GitHub Pages.

## Quick Export

```bash
# From project root
python3 export_static.py
```

This single command will:
1. Load backend data (cluster results, task metadata)
2. Compress and resize original upload images (WebP, max 1280px)
3. Compress and resize sticker images (WebP with transparency, max 512px)
4. Generate thumbnails (WebP, 128px max dimension)
5. Export `data.json` with all sticker groups and metadata (paths remapped to the exported format)
6. Build the React frontend in static mode
7. Copy all assets to `docs/` directory

> **WebP note:** By default images are exported as WebP, which is ~60-70%
> smaller than the previous PNG/JPEG output and keeps GitHub Pages well under
> its size limit. Because WebP renames files, `data.json` paths are remapped
> automatically. If you previously exported in another format, clear the old
> output once before re-exporting:
>
> ```bash
> rm -rf docs/static && python3 export_static.py
> ```
>
> To revert to PNG/JPEG output, set `USE_WEBP = False` in `export_static.py`.

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
USE_WEBP = True         # WebP output (smaller); set False for PNG/JPEG
THUMBNAIL_SIZE = 128    # px max dimension for thumbnails
FULL_MAX_SIZE = 512     # px max dimension for full sticker images
UPLOAD_MAX_SIZE = 1280  # px max dimension for original uploads
FULL_QUALITY = 80       # quality for full sticker images
THUMB_QUALITY = 72      # quality for thumbnails
UPLOAD_QUALITY = 78     # quality for original uploads
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

With ~20,000 stickers (WebP defaults):
- **Uploads** (WebP, 1280px): ~80-120 MB
- **Full stickers** (WebP, 512px): ~250-350 MB
- **Thumbnails** (WebP, 128px): ~60-90 MB
- **Total**: ~400-560 MB (down from ~2.3 GB of PNG/JPEG output)

GitHub Pages has a 1GB limit, so stay within these guidelines. WebP is the
single biggest lever here — reverting to PNG/JPEG roughly triples the size.
