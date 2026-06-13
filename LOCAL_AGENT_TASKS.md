# Local Agent Hand-off — Tokyo Sticker DB optimization

This is a task brief for an agent/developer running **locally with full access**
to the backend data that the cloud session did **not** have:

- `backend/static/uploads/` and `backend/static/results/` (the source images)
- `backend/tasks.json` and `backend/cluster_results.json`

The cloud session already shipped the frontend/code changes on branch
`claude/static-dynamic-perf-optimize-wlw952`. Your job is to **regenerate the
image assets + `data.json`** with the new optimized pipeline, verify everything
renders, and commit the result.

---

## 0. Prerequisites

```bash
git checkout claude/static-dynamic-perf-optimize-wlw952
git pull origin claude/static-dynamic-perf-optimize-wlw952
cd frontend && npm install && cd ..
```

Confirm the source data is present (these are git-ignored, so they only exist locally):

```bash
ls backend/static/results | head      # should list sticker folders
ls backend/static/uploads | head      # should list original uploads
test -f backend/tasks.json && test -f backend/cluster_results.json && echo "data OK"
```

If any are missing, stop — the export can't run without them.

---

## 1. Re-export the static site as WebP (the big win)

The export format changed from PNG/JPEG to **WebP**. WebP renames files, so the
old `docs/static/*.png|.jpg` files would become dead weight. Clear them first:

```bash
rm -rf docs/static
python3 export_static.py
```

Expected result: `docs/` drops from ~2.3 GB to **under ~600 MB**. The script
prints the final total size at the end.

Knobs are at the top of `export_static.py` if you need to trade quality vs size:

```python
USE_WEBP = True
THUMBNAIL_SIZE = 128     # grid/map icons
FULL_MAX_SIZE  = 512     # modal/zoom image
UPLOAD_MAX_SIZE = 1280   # original uploads (home gallery + editor)
FULL_QUALITY = 80 ; THUMB_QUALITY = 72 ; UPLOAD_QUALITY = 78
```

**Verify quality before committing.** Open a handful of the new WebP files
(especially ones with fine line art / text) and confirm they don't look mushy.
If they do, bump `FULL_QUALITY` to ~85 and re-run.

---

## 2. Verify it actually works in a browser

```bash
npx serve docs -p 3333
# open http://localhost:3333
```

Check each of these (this is what the cloud session could not test):

1. **Home gallery** loads quickly; thumbnails are the new uploads.
2. **ALL STICKERS** grid: only ~80 load at first, more appear as you scroll
   (watch the Network tab — it should NOT fire ~20k requests on load).
3. **ALL STICKERS → canvas** (Layout icon): smooth; header shows `250 / N`.
4. Click any sticker → modal shows the image, a **Source** link (opens the X
   post), and a **Similar Stickers** strip when the sticker is in a group.
5. **GROUPED** view: cards, expand a group, click a sticker → same modal.
6. **Map View** (3D): nodes render, clicking opens the modal.
7. Confirm no broken images (404s) in the console — that would mean a path/
   extension mismatch in `data.json`.

If images 404: check that `data.json` sticker paths end in `.webp` and that the
files on disk match. The remap logic lives in `_remap_clusters` / `_remap_tasks`
in `export_static.py`.

---

## 3. Commit and push the regenerated assets

```bash
git add docs
git commit -m "Regenerate static export as WebP (smaller, GitHub Pages friendly)"
git push origin claude/static-dynamic-perf-optimize-wlw952
```

> This is a large commit (thousands of files change format). That's expected and
> only happens once. Subsequent exports are incremental.

---

## 4. Optional deeper improvements (only if you want to go further)

These need full data + judgement, so they're left to you:

- **Reduce file count, not just size.** The repo still ships *two* files per
  sticker (`results/` + `thumbs/`, ~40k files total). If git/Pages file-count is
  a pain, consider shipping a single ~384px WebP per sticker and dropping the
  separate thumbs tier — the grid would just downscale it. This needs a matching
  frontend change (the `/results/` ↔ `/thumbs/` path swaps in
  `GlobalGallery.tsx`, `GroupedGallery.tsx`, `EmbeddingMap.tsx`, `StickerModal.tsx`).
- **Shrink `data.json` more.** If it's still large after re-export, the `tasks`
  array carries the most weight. You can drop fields the static frontend never
  reads (`transformStaticTasks` in `frontend/src/store.ts` only uses
  `image_path`, `result_paths[].path/box/score`, `metadata`, `created_at`, `id`).
- **GitHub Pages settings:** Settings → Pages → Deploy from branch → `/docs`.
  Confirm it points at the branch you merge into.
- **Source-URL coverage.** `getSourceUrl` in `frontend/src/utils.ts` hardcodes
  `x.com/SemantiClub`. If stickers come from other artists, prefer storing a
  real `source_url` in each task's `metadata` so the modal links to the correct
  account rather than the fallback guess.

---

## Summary of what the cloud session already did (no action needed)

- `GlobalGallery`: windowed/infinite-scroll grid + capped physics canvas.
- `PhysicsCanvas`: focused view now uses the rich `StickerModal` (Source +
  Similar Stickers).
- `export_static.py`: WebP output, smaller dimensions, compressed uploads,
  path remapping, rounded embedding-map coords.
- Removed stale orphaned bundles from `docs/assets/`.
- Frontend was rebuilt, so `docs/assets/*` + `docs/index.html` are current.
