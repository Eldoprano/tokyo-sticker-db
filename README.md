# Tokyo Sticker DB

AI-powered sticker extraction and visual clustering tool. Uses SAM3 for segmentation and DINOv2 for visual similarity grouping.

## Features

- **Automatic Sticker Extraction** - SAM3 detects and extracts stickers from images
- **Visual Clustering** - DINOv2 embeddings + HDBSCAN groups similar stickers
- **Interactive Gallery** - Browse stickers by group or explore the embedding map
- **Static Export** - Deploy as a GitHub Pages site

## Installation

```bash
# Install Python dependencies (requires Python 3.11+)
cd backend && pip install -r requirements.txt

# Install frontend dependencies
cd frontend && npm install
```

## Quick Start

```bash
# Run both backend and frontend with one command
./start.sh

# Or run separately:
# Backend
cd backend && python main.py

# Frontend (separate terminal)
cd frontend && npm run dev
```

## Static Export

```bash
python export_static.py  # Outputs to docs/
```

## Tech Stack

- **Frontend**: React, Vite, Three.js
- **Backend**: FastAPI, PyTorch
- **Models**: SAM3 (segmentation), DINOv2 (embeddings)

## License

MIT
