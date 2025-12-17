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
