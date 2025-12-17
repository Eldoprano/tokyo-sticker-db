import os
import shutil
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, Body, BackgroundTasks, Form, File
from typing import Dict, Any, Optional
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import hashlib
import time
from dotenv import load_dotenv

from backend.state import state, SegmentationTask
from backend.segmentation import get_segmentator
from backend.worker import segmentation_worker
from backend.embeddings import get_embedding_service
from backend.embeddings import get_embedding_service
from backend.clustering import cluster_embeddings, organize_clusters, run_clustering_task
import asyncio
from pydantic import BaseModel

class TaskCreateRequest(BaseModel):
    image_path: str
    priority: int = 2
    iou_threshold: float = 0.8
    score_threshold: float = 0.5
    file_hash: str | None = None
    metadata: Dict[str, Any] = {}

class PriorityUpdateRequest(BaseModel):
    task_id: str
    priority: int

class ClusterParams(BaseModel):
    min_cluster_size: int = 2
    min_samples: int = 1
    cluster_selection_epsilon: float = 0.0

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("Starting backend...")
    hf_token = os.getenv("HF_TOKEN")
    use_mock = os.getenv("USE_MOCK", "False").lower() == "true"
    
    # Initialize Segmentator
    try:
        state.segmentator = get_segmentator(use_mock=use_mock, hf_token=hf_token)
        state.segmentator.load_model()
    except Exception as e:
        print(f"Failed to load segmentator: {e}")
        raise e

    # Re-queue pending tasks from persistence
    print(f"Checking {len(state.tasks)} tasks for re-queueing...")
    requeued_count = 0
    for task_id, task in state.tasks.items():
        if task.status in ["pending", "processing"]:
            # Reset processing -> pending for restart
            task.status = "pending"
            # Default priority 2 as we don't persist priority yet
            await state.add_task(task_id, priority=2)
            requeued_count += 1
    print(f"Re-queued {requeued_count} tasks.")

    # Start Worker
    worker_task = asyncio.create_task(segmentation_worker())
    
    yield
    
    # Shutdown logic
    print("Shutting down...")
    worker_task.cancel()



app = FastAPI(lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static Mounts
base_dir = os.path.dirname(__file__)
static_dir = os.path.join(base_dir, "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

def calculate_file_hash(file: UploadFile) -> str:
    """Calculate SHA256 hash of uploaded file content."""
    sha256_hash = hashlib.sha256()
    file.file.seek(0)
    for byte_block in iter(lambda: file.file.read(4096), b""):
        sha256_hash.update(byte_block)
    file.file.seek(0)
    return sha256_hash.hexdigest()

@app.post("/upload")
async def upload_image(file: UploadFile = File(...), relative_path: str | None = Form(None)):
    # Check for duplicate via hash
    file_hash = calculate_file_hash(file)
    

    if file_hash in state.file_hashes:
        existing_data = state.file_hashes[file_hash]
        
        # Handle dict or legacy string
        if isinstance(existing_data, dict):
            existing_task_id = existing_data['task_id']
        else:
            existing_task_id = existing_data
            
        task = state.tasks.get(existing_task_id)
        
        # If task exists in memory (current session) AND is completed/processing
        if task:
             return {
                 "file_id": existing_task_id, 
                 "path": task.image_path, 
                 "url": f"/static/uploads/{os.path.basename(task.image_path)}",
                 "reused_task_id": existing_task_id
             }
        
        # If task not in memory (restart), we might still want to try to find the file
        # But we need to return a path. 
        # For now, let's just proceed with re-upload if not in memory, 
        # OR better: if we have the hash, we can assume the file exists if we kept it consistently?
        # Actually, let's just use the hash mechanism to avoid re-processing if the user requests it.
        # But here we are just uploading.
        # The user wants "reuse segmentation". So if we return a `reused_task_id`, the frontend can potentially skip creating a new task?
        # Or we handle it in /segment/task.
             
    file_id = str(uuid.uuid4())
    upload_dir = os.path.join(static_dir, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    # sanitize filename
    safe_filename = "".join([c for c in file.filename if c.isalpha() or c.isdigit() or c in "._-"])
    file_path = os.path.join(upload_dir, f"{file_id}_{safe_filename}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {
        "file_id": file_id, 
        "path": file_path, 
        "url": f"/static/uploads/{os.path.basename(file_path)}", 
        "hash": file_hash,
        "metadata": parse_metadata_from_path(relative_path) if relative_path else {}
    }

def parse_metadata_from_path(relative_path: str) -> Dict[str, Any]:
    """Extract Artist and Post ID from directory structure."""
    if not relative_path:
        return {}
    
    parts = relative_path.split('/')
    # Expected: .../ArtistName/PostID_Etc.jpg
    if len(parts) >= 2:
        artist = parts[-2]
        filename = parts[-1]
        
        # Extract Post ID (assume everything before first underscore or dot is ID)
        # Verify if digits later? For now, simple split.
        stem = filename.split('.')[0]
        post_id = stem.split('_')[0]
        
        source_url = f"https://x.com/{artist}/status/{post_id}"
        return {"artist": artist, "source_url": source_url}
    return {}

@app.post("/segment/task")
async def create_segment_task(req: TaskCreateRequest):
    """
    Create a segmentation task.
    If 'file_hash' is provided and matches an existing completed/processing task, reuse it.
    """
    
    # Check for reuse if hash provided

    # Check for reuse if hash provided
    # The redundant check logic below was causing issues because it didn't handle the dict structure
    # We already have a robust check in the block starting at line 159 (now handling parameters)
    # So we can remove this redundant block or update it. 
    # Let's remove it to favour the parameter-aware check below which is the source of truth now.

        
    # Check for reuse
    if req.file_hash:
        existing_data = state.file_hashes.get(req.file_hash)
        if existing_data:
            # Check if dict structure or legacy string
            if isinstance(existing_data, dict):
                # Check consistency
                if (existing_data.get('iou') == req.iou_threshold and 
                    existing_data.get('score') == req.score_threshold):
                        task_id = existing_data['task_id']
                        if task_id in state.tasks:
                            return {"task_id": task_id, "status": state.tasks[task_id].status, "reused": True}
            else:
                # Legacy string (just task_id)
                task_id = existing_data
                if task_id in state.tasks:
                     return {"task_id": task_id, "status": state.tasks[task_id].status, "reused": True}

    # Create new task
    task_id = str(uuid.uuid4())
    task = SegmentationTask(
        task_id=task_id, 
        image_path=req.image_path,
        iou_threshold=req.iou_threshold,
        score_threshold=req.score_threshold,
        metadata=req.metadata
    )
    state.tasks[task_id] = task
    await state.add_task(task_id, req.priority)
    
    # Save hash with params
    if req.file_hash:
        state.save_hash(req.file_hash, {
            "task_id": task_id,
            "iou": req.iou_threshold,
            "score": req.score_threshold
        })
    
    state.save_tasks_db()
    
    return {"task_id": task_id, "status": "queued"}

@app.post("/segment/priority")
async def update_priority(req: PriorityUpdateRequest):
    if req.task_id in state.tasks:
        await state.add_task(req.task_id, req.priority) 
        # Note: Worker handles logic (if task is not started, this bumps it in queue effectively)
        return {"status": "updated"}
    return {"error": "Task not found"}

@app.delete("/tasks/{task_id}")
async def delete_task_endpoint(task_id: str):
    if state.delete_task(task_id):
        return {"status": "deleted", "task_id": task_id}
    return {"error": "Task not found"}


@app.get("/results/{task_id}")
async def get_results(task_id: str):
    task = state.tasks.get(task_id)
    if not task:
        return {"error": "Task not found"}
    return task



@app.post("/cluster")
async def trigger_clustering(background_tasks: BackgroundTasks, params: ClusterParams = ClusterParams()):
    """
    Trigger clustering in background.
    """
    if state.clustering_progress["status"] == "running":
        return {"status": "already_running"}
        
    background_tasks.add_task(
        run_clustering_task,
        min_cluster_size=params.min_cluster_size,
        min_samples=params.min_samples,
        cluster_selection_epsilon=params.cluster_selection_epsilon
    )
    return {"status": "started"}

@app.get("/cluster/status")
async def get_clustering_status():
    return state.clustering_progress

@app.get("/clusters")
async def get_clusters():
    """
    Get cached clustering results.
    Returns empty if clustering hasn't been run yet.
    """
    if state.cluster_results is None:
        return {"groups": [], "ungrouped": [], "total_grouped": 0, "total_ungrouped": 0, "cached": False}
    
    return {**state.cluster_results, "cached": True}

@app.get("/segment/status")
async def get_segmentation_status():
    """Get overall segmentation queue status."""
    pending = sum(1 for t in state.tasks.values() if t.status == "pending")
    processing = sum(1 for t in state.tasks.values() if t.status == "processing")
    completed = sum(1 for t in state.tasks.values() if t.status == "completed")
    failed = sum(1 for t in state.tasks.values() if t.status == "failed")
    total = len(state.tasks)
    return {
        "pending": pending,
        "processing": processing,
        "completed": completed,
        "failed": failed,
        "total": total
    }

@app.get("/status")
async def get_status():
    return {"queue_size": state.queue.qsize(), "tasks": len(state.tasks)}

@app.get("/tasks")
async def list_tasks():
    """Return list of all tasks."""
    return [t for t in state.tasks.values()]

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
