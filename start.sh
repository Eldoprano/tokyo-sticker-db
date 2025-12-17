#!/bin/bash

# Kill background processes on exit
trap "kill 0" EXIT

echo "Starting Tokyo Sticker DB..."

# Start Backend in background
echo "Starting Backend (FastAPI)..."
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait a bit for backend to initialize
sleep 2

# Start Frontend
echo "Starting Frontend (Vite)..."
cd frontend && npm run dev

# Wait for backend
wait $BACKEND_PID
