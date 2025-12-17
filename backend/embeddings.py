"""
DINOv2-based image embedding service for sticker similarity grouping.

Uses facebook/dinov2-base for generating 768-dimensional embeddings
that capture fine-grained visual features robust to orientation and lighting.
"""

import os
from typing import List, Optional
import numpy as np
from PIL import Image
import torch
from transformers import AutoImageProcessor, AutoModel


class EmbeddingService:
    """Lazy-loading DINOv2 embedding service."""
    
    _instance: Optional["EmbeddingService"] = None
    
    def __init__(self):
        self.model = None
        self.processor = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[EmbeddingService] Will use device: {self.device}")
    
    @classmethod
    def get_instance(cls) -> "EmbeddingService":
        """Singleton accessor."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def load_model(self):
        """Load DINOv2 model and processor (lazy)."""
        if self.model is not None:
            return
        
        print("[EmbeddingService] Loading DINOv2 model...")
        self.processor = AutoImageProcessor.from_pretrained("facebook/dinov2-base")
        self.model = AutoModel.from_pretrained("facebook/dinov2-base")
        self.model.to(self.device)
        self.model.eval()
        print("[EmbeddingService] DINOv2 model loaded.")
    
    def get_embedding(self, image_path: str) -> np.ndarray:
        """
        Generate embedding for a single image.
        
        Args:
            image_path: Path to the image file
            
        Returns:
            768-dimensional numpy array
        """
        self.load_model()
        
        try:
            image = Image.open(image_path).convert("RGB")
        except Exception as e:
            print(f"[EmbeddingService] Failed to open {image_path}: {e}")
            # Return zero vector for failed images
            return np.zeros(768, dtype=np.float32)
        
        inputs = self.processor(images=image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            # Use CLS token embedding (first token)
            embedding = outputs.last_hidden_state[:, 0, :].cpu().numpy().squeeze()
        
        return embedding.astype(np.float32)
    
    def get_embeddings_batch(self, image_paths: List[str], batch_size: int = 8, progress_callback=None) -> np.ndarray:
        """
        Generate embeddings for multiple images efficiently.
        
        Args:
            image_paths: List of paths to image files
            batch_size: Number of images to process at once
            progress_callback: Optional callable(current_count)
            
        Returns:
            (N, 768) numpy array of embeddings
        """
        self.load_model()
        
        all_embeddings = []
        
        for i in range(0, len(image_paths), batch_size):
            batch_paths = image_paths[i:i + batch_size]
            batch_images = []
            valid_indices = []
            
            for idx, path in enumerate(batch_paths):
                try:
                    img = Image.open(path).convert("RGB")
                    batch_images.append(img)
                    valid_indices.append(idx)
                except Exception as e:
                    print(f"[EmbeddingService] Skipping {path}: {e}")
            
            if not batch_images:
                # All images in batch failed, add zero vectors
                all_embeddings.extend([np.zeros(768, dtype=np.float32)] * len(batch_paths))
                if progress_callback:
                    progress_callback(len(all_embeddings))
                continue
            
            inputs = self.processor(images=batch_images, return_tensors="pt", padding=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            with torch.inference_mode():
                with torch.autocast(device_type=self.device, dtype=torch.float16 if self.device == 'cuda' else torch.float32):
                    outputs = self.model(**inputs)
                    embeddings = outputs.last_hidden_state[:, 0, :].cpu().float().numpy()
            
            # Map back embeddings, filling zeros for failed images
            batch_result = [np.zeros(768, dtype=np.float32)] * len(batch_paths)
            for j, valid_idx in enumerate(valid_indices):
                batch_result[valid_idx] = embeddings[j].astype(np.float32)
            
            all_embeddings.extend(batch_result)
            
            current_count = len(all_embeddings)
            print(f"[EmbeddingService] Processed {current_count}/{len(image_paths)} images")
            
            if progress_callback:
                progress_callback(current_count)
        
        return np.array(all_embeddings)


def get_embedding_service() -> EmbeddingService:
    """Get the singleton embedding service instance."""
    return EmbeddingService.get_instance()
