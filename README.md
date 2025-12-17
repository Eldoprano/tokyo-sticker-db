# Tokyo Sticker DB

Vibe coded sticker extraction and visual clustering tool.  

## Features

- **Automatic Sticker Extraction** - [SAM3](https://huggingface.co/facebook/sam3) detects and extracts stickers from images
- **Visual Clustering** - [DINOv2](https://huggingface.co/facebook/dinov2-base) embeddings + HDBSCAN groups similar stickers
- **Interactive Gallery** - Browse stickers by group or explore the embedding map

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

## License & Copyright

**Code**: MIT License - Feel free to use, modify, and distribute.

**Images**: The stickers and images displayed on the demo site are sourced from third-party artists ([@SemantiClub](https://x.com/SemantiClub), [@_kawaii_sticker](https://x.com/_kawaii_sticker)) and remain the property of their respective creators. They are included for demonstration purposes only. If you are a rights holder and wish to have your content removed, please open an issue.

For your own deployment, please use images you have the rights to use.
