import asyncio
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

@dataclass(order=True)
class QueueItem:
    priority: int
    timestamp: float
    task_id: str = field(compare=False)

@dataclass
class SegmentationTask:
    task_id: str
    image_path: str
    status: str = "pending"  # pending, processing, completed, failed
    # result_paths now holds list of dicts: {path, box, score}
    result_paths: List[Dict[str, Any]] = field(default_factory=list)
    overlay_path: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    error: Optional[str] = None
    iou_threshold: float = 0.8
    score_threshold: float = 0.5
    metadata: Dict[str, Any] = field(default_factory=dict)

import json
import os
import pickle
import numpy as np

class AppState:
    def __init__(self):
        self.queue = asyncio.PriorityQueue()
        self.tasks: Dict[str, SegmentationTask] = {}
        self.segmentator = None  # Initialized in main
        self.cluster_results: Optional[Dict[str, Any]] = None  # Caches clustering output
        
        # Clustering Progress
        self.clustering_progress = {
            "status": "idle",
            "total": 0,
            "current": 0,
            "start_time": 0.0,
            "estimated_remaining": 0.0
        }
        
        # Segmentation Reuse (File Hash -> Task ID)
        self.hash_db_path = os.path.join(os.path.dirname(__file__), "hash_db.json")
        self.file_hashes: Dict[str, str] = self._load_hashes()

        # Embedding Cache (File Path -> Embedding Vector)
        self.embedding_cache_path = os.path.join(os.path.dirname(__file__), "embedding_cache.pkl")
        self.embedding_cache: Dict[str, np.ndarray] = self._load_embedding_cache()

        # Cluster Results Persistence
        self.cluster_results_path = os.path.join(os.path.dirname(__file__), "cluster_results.json")
        self.cluster_results: Optional[Dict[str, Any]] = self._load_cluster_results()

    def _load_cluster_results(self) -> Optional[Dict[str, Any]]:
        if os.path.exists(self.cluster_results_path):
            try:
                with open(self.cluster_results_path, "r") as f:
                    print(f"Loading cluster results from {self.cluster_results_path}")
                    return json.load(f)
            except Exception as e:
                print(f"Failed to load cluster results: {e}")
        return None

    def save_cluster_results(self):
        if self.cluster_results:
            try:
                with open(self.cluster_results_path, "w") as f:
                    json.dump(self.cluster_results, f)
            except Exception as e:
                print(f"Failed to save cluster results: {e}")

    def _load_embedding_cache(self) -> Dict[str, np.ndarray]:
        if os.path.exists(self.embedding_cache_path):
            try:
                with open(self.embedding_cache_path, "rb") as f:
                    print(f"Loading embedding cache from {self.embedding_cache_path}")
                    return pickle.load(f)
            except Exception as e:
                print(f"Failed to load embedding cache: {e}")
        return {}
    
    def save_embedding_cache(self):
        try:
            with open(self.embedding_cache_path, "wb") as f:
                pickle.dump(self.embedding_cache, f)
        except Exception as e:
            print(f"Failed to save embedding cache: {e}")


    def _load_hashes(self) -> Dict[str, Any]:
        if os.path.exists(self.hash_db_path):
            try:
                with open(self.hash_db_path, "r") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Failed to load hash DB: {e}")
        return {}

    def save_hash(self, file_hash: str, task_data: Dict[str, Any]):
        self.file_hashes[file_hash] = task_data
        try:
            with open(self.hash_db_path, "w") as f:
                json.dump(self.file_hashes, f)
        except Exception as e:
            print(f"Failed to save hash DB: {e}")
            
    def cleanup_temporary_files(self):
        """Clears uploads, results, and persistence files."""
        import shutil
        base_dir = os.path.dirname(__file__)
        
        # Clear uploads
        uploads_dir = os.path.join(base_dir, "static", "uploads")
        if os.path.exists(uploads_dir):
            shutil.rmtree(uploads_dir)
        os.makedirs(uploads_dir, exist_ok=True)
        
        # Clear results
        results_dir = os.path.join(base_dir, "static", "results")
        if os.path.exists(results_dir):
            shutil.rmtree(results_dir)
        os.makedirs(results_dir, exist_ok=True)
        
        # Clear DBs
        if os.path.exists(self.hash_db_path):
            os.remove(self.hash_db_path)
        if os.path.exists(self.embedding_cache_path):
            os.remove(self.embedding_cache_path)
        tasks_path = os.path.join(os.path.dirname(__file__), "tasks.json")
        if os.path.exists(tasks_path):
            os.remove(tasks_path)
            
        # Reset memory
        self.file_hashes = {}
        self.embedding_cache = {}
        self.tasks = {}
        self.cluster_results = None
        self.clustering_progress = {
            "status": "idle",
            "total": 0,
            "current": 0,
            "start_time": 0.0,
            "estimated_remaining": 0.0
        }
        print("System cleanup completed.")

    async def add_task(self, task_id: str, priority: int = 2):
        # Only reset status if not already completed or processing.
        # This prevents re-queueing completed tasks for processing.
        task = self.tasks.get(task_id)
        if task and task.status in ('completed', 'processing'):
            # Task is already done or in progress. Don't re-queue.
            return
        if task:
            task.status = "pending"
        # Priority: 0 (High/Immediate), 1 (Medium/Next), 2 (Low/Batch)
        await self.queue.put(QueueItem(priority, time.time(), task_id))

    def delete_task(self, task_id: str):
        """
        Delete a task and its associated files.
        """
        if task_id not in self.tasks:
            return False
            
        task = self.tasks[task_id]
        
        # 1. Remove files
        try:
            # Resolve image path if it's a relative URL
            img_path = task.image_path
            if img_path.startswith('/static/'):
                 base_dir = os.path.dirname(__file__)
                 img_path = os.path.join(base_dir, img_path.lstrip('/'))

            if os.path.exists(img_path):
                os.remove(img_path)
            
            # Check for overlay
            if task.overlay_path and os.path.exists(task.overlay_path):
                os.remove(task.overlay_path)
                
            # Check for result stickers
            for result in task.result_paths:
                path = result.get('path')
                # Path comes as URL-like '/static/...', we need file path
                # Assuming standard structure relative to static dir
                if path:
                    # Strip leading slash if present
                    rel_path = path.lstrip('/')
                    file_path = os.path.join(os.path.dirname(__file__), rel_path)
                    if os.path.exists(file_path):
                        os.remove(file_path)
        except Exception as e:
            print(f"Error deleting files for task {task_id}: {e}")
            
        # 2. Remove from hashes
        # This is a bit inefficient (O(N)), but safe enough for now
        hash_to_remove = None
        for file_hash, data in self.file_hashes.items():
            t_id = data.get('task_id') if isinstance(data, dict) else data
            if t_id == task_id:
                hash_to_remove = file_hash
                break
        
        if hash_to_remove:
            del self.file_hashes[hash_to_remove]
            self.save_hash(hash_to_remove, None) # Will actually trigger full save_hash_db logic if we implemented that way, but let's just save db
            try:
                with open(self.hash_db_path, "w") as f:
                    json.dump(self.file_hashes, f)
            except Exception as e:
                print(f"Failed to save hash DB after delete: {e}")

        # 3. Remove from tasks
        del self.tasks[task_id]
        self.save_tasks_db()
        
        return True

    def update_priority(self, task_id: str, new_priority: int):
        pass

    # --- Task Persistence ---
    def _load_tasks(self) -> Dict[str, SegmentationTask]:
        tasks_path = os.path.join(os.path.dirname(__file__), "tasks.json")
        if os.path.exists(tasks_path):
            try:
                with open(tasks_path, "r") as f:
                    data = json.load(f)
                    tasks = {}
                    for tid, tdata in data.items():
                        # Reconstruct SegmentationTask objects
                        tasks[tid] = SegmentationTask(**tdata)
                    print(f"Loaded {len(tasks)} tasks from disk.")
                    return tasks
            except Exception as e:
                print(f"Failed to load tasks DB: {e}")
        return {}

    def save_tasks_db(self):
        tasks_path = os.path.join(os.path.dirname(__file__), "tasks.json")
        try:
            # Convert tasks to dict
            data = {tid: task.__dict__ for tid, task in self.tasks.items()}
            with open(tasks_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Failed to save tasks DB: {e}")

state = AppState()
# Initialize tasks loading after creation
state.tasks = state._load_tasks()
