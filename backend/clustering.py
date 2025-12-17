"""
HDBSCAN-based clustering for grouping similar sticker embeddings.

Uses hierarchical density-based clustering to automatically find groups
of similar stickers without requiring a pre-specified cluster count.
"""

from typing import List, Dict, Any, Tuple
import numpy as np
import hdbscan
import os
import time
import asyncio
from tqdm import tqdm
from sklearn.preprocessing import normalize
from sklearn.decomposition import PCA
from backend.state import state
from backend.embeddings import get_embedding_service


def get_projection(embeddings: np.ndarray, n_components: int = 3) -> np.ndarray:
    """
    Reduce high-dimensional embeddings to 2D/3D using PCA for visualization.
    
    Args:
        embeddings: (N, D) array of embedding vectors
        n_components: Number of components (2 or 3)
        
    Returns:
        (N, n_components) array of coordinates
    """
    if len(embeddings) < 2:
        return np.zeros((len(embeddings), n_components))
    
    # Normalize first
    normalized = normalize(embeddings, norm='l2')
    
    # PCA
    pca = PCA(n_components=n_components)
    coords = pca.fit_transform(normalized)
    
    # Normalize to 0-1 range for easier frontend use
    coords -= coords.min(axis=0)
    coords /= coords.max(axis=0) + 1e-10
    
    return coords


def cluster_embeddings(
    embeddings: np.ndarray,
    min_cluster_size: int = 2,
    min_samples: int = 1,
    cluster_selection_epsilon: float = 0.0
) -> np.ndarray:
    """
    Cluster embeddings using HDBSCAN.
    
    Args:
        embeddings: (N, D) array of embedding vectors
        min_cluster_size: Minimum number of samples in a cluster
        min_samples: Number of samples in neighborhood for core points
        cluster_selection_epsilon: Distance threshold for merging clusters (0.0 means no merging)
        
    Returns:
        Array of cluster labels (-1 for noise/ungrouped)
    """
    if len(embeddings) < 2:
        return np.array([-1] * len(embeddings))
    
    # Normalize embeddings for better distance computation
    normalized = normalize(embeddings, norm='l2')
    
    # HDBSCAN clustering
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        cluster_selection_epsilon=cluster_selection_epsilon,
        metric='euclidean',
        prediction_data=True
    )
    
    labels = clusterer.fit_predict(normalized)
    
    return labels


def organize_clusters(
    sticker_paths: List[str],
    labels: np.ndarray
) -> Dict[str, Any]:
    """
    Organize clustering results into structured groups.
    
    Args:
        sticker_paths: List of sticker file paths
        labels: Cluster labels from HDBSCAN
        
    Returns:
        Dict with 'groups' (list of cluster dicts) and 'ungrouped' (list of paths)
    """
    # Group stickers by label
    label_to_paths: Dict[int, List[str]] = {}
    ungrouped: List[str] = []
    
    for path, label in zip(sticker_paths, labels):
        if label == -1:
            ungrouped.append(path)
        else:
            if label not in label_to_paths:
                label_to_paths[label] = []
            label_to_paths[label].append(path)
    
    # Create group objects sorted by size (largest first)
    groups = []
    for label, paths in sorted(label_to_paths.items(), key=lambda x: -len(x[1])):
        groups.append({
            "id": int(label),
            "sticker_paths": paths,
            "count": len(paths)
        })
    
    return {
        "groups": groups,
        "ungrouped": ungrouped,
        "total_grouped": sum(g["count"] for g in groups),
        "total_ungrouped": len(ungrouped)
    }

async def run_clustering_task(
    min_cluster_size: int = 2,
    min_samples: int = 1,
    cluster_selection_epsilon: float = 0.0
):
    """
    Background task to run clustering.
    Only computes embeddings if not cached.
    """
    
    print(f"[Clustering] Starting task (min_size={min_cluster_size}, min_samples={min_samples}, epsilon={cluster_selection_epsilon})...")
    try:
        # We need the static dir path.
        base_dir = os.path.dirname(__file__)
        static_dir = os.path.join(base_dir, "static")
        results_dir = os.path.join(static_dir, "results")
        
        if not os.path.exists(results_dir):
            state.clustering_progress["status"] = "failed"
            return
            
        print("[Clustering] Starting background clustering...")
        
        # 1. Collect paths (File I/O - fast enough for sync usually, but runs in loop now)
        # Iterate efficiently
        sticker_paths = []
        for root, dirs, files in os.walk(results_dir):
            for filename in files:
                if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) and not filename.endswith('_overlay.png'):
                    full_path = os.path.join(root, filename)
                    sticker_paths.append(full_path)
        
        total_files = len(sticker_paths)
        if total_files == 0:
            state.clustering_progress.update({"status": "completed", "total": 0, "current": 0})
            state.cluster_results = {"groups": [], "ungrouped": [], "total_grouped": 0, "total_ungrouped": 0}
            return

        state.clustering_progress.update({
            "status": "running",
            "total": total_files,
            "current": 0,
            "start_time": time.time(),
            "estimated_remaining": -1
        })
        
        # 2. Embeddings with caching and progress
        embedding_service = get_embedding_service()
        final_embeddings = np.zeros((total_files, 768), dtype=np.float32)
        
        # Check cache
        paths_to_compute = []
        indices_to_compute = []
        
        print("[Clustering] Checking cache...")
        for i, path in enumerate(sticker_paths):
            if path in state.embedding_cache:
                final_embeddings[i] = state.embedding_cache[path]
            else:
                paths_to_compute.append(path)
                indices_to_compute.append(i)
                
        print(f"[Clustering] Need to compute {len(paths_to_compute)}/{total_files} embeddings.")
        
        # Update progress for cached items
        state.clustering_progress["current"] = total_files - len(paths_to_compute)
        
        loop = asyncio.get_running_loop()

        if paths_to_compute:
            # Run heavy embedding generation in executor
            print("[Clustering] Computing embeddings in executor...")
            
            def compute_embeddings_sync():
                return embedding_service.get_embeddings_batch(
                    paths_to_compute, 
                    batch_size=32, 
                    progress_callback=lambda c: state.clustering_progress.update({
                        "current": (total_files - len(paths_to_compute)) + c
                    })
                )
            
            computed_embeddings = await loop.run_in_executor(None, compute_embeddings_sync)
            
            # Store in final array and cache
            for k, idx in enumerate(indices_to_compute):
                emb = computed_embeddings[k]
                final_embeddings[idx] = emb
                state.embedding_cache[sticker_paths[idx]] = emb
            
            # Save cache in executor (pickle dump can be large)
            await loop.run_in_executor(None, state.save_embedding_cache)

        # 3. Clustering
        print("[Clustering] Running HDBSCAN...")
        
        def run_hdbscan():
            return cluster_embeddings(
                final_embeddings,
                min_cluster_size=min_cluster_size,
                min_samples=min_samples,
                cluster_selection_epsilon=cluster_selection_epsilon
            )
            
        labels = await loop.run_in_executor(None, run_hdbscan)
        
        # 3.5. Compute 3D projection for visualization
        print("[Clustering] Computing 3D projection...")
        coords = await loop.run_in_executor(None, lambda: get_projection(final_embeddings, n_components=3))
        
        # 4. Organize - include 2D/3D coordinates
        sticker_urls = []
        sticker_map_data = [] 
        
        for i, p in enumerate(sticker_paths):
            rel_path = os.path.relpath(p, static_dir)
            url = f"/static/{rel_path}"
            sticker_urls.append(url)
            sticker_map_data.append({
                "path": url,
                "x": float(coords[i][0]),
                "y": float(coords[i][1]),
                "z": float(coords[i][2]),
                "cluster_id": int(labels[i])
            })
            
        result = organize_clusters(sticker_urls, labels)
        result["embedding_map"] = sticker_map_data
        
        state.cluster_results = result
        state.save_cluster_results()
        state.clustering_progress["status"] = "completed"
        print(f"[Clustering] Finished. Found {len(result['groups'])} groups.")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Clustering] Failed: {e}")
        state.clustering_progress["status"] = "failed"
