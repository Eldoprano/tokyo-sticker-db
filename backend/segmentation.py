import os
import time
import torch
import numpy as np
import cv2
from PIL import Image
from typing import List

# Try importing transformers
try:
    from transformers import Sam3Model, Sam3Processor
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

class BaseSegmentator:
    def load_model(self):
        raise NotImplementedError
    
    def segment(self, image_path: str, output_dir: str) -> tuple[List[dict], str]:
        raise NotImplementedError

class RealSegmentator(BaseSegmentator):
    def __init__(self, model_id="facebook/sam3", hf_token=None):
        self.model_id = model_id
        self.hf_token = hf_token
        self.model = None
        self.processor = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def load_model(self):
        print(f"Loading SAM3 model {self.model_id} on {self.device}...")
        if not TRANSFORMERS_AVAILABLE:
            raise ImportError("Transformers library not found.")
        
        # SAM3 for image segmentation
        try:
            self.processor = Sam3Processor.from_pretrained(self.model_id, token=self.hf_token)
            self.model = Sam3Model.from_pretrained(self.model_id, token=self.hf_token).to(self.device)
        except Exception as e:
            print(f"Warning: Failed to load SAM3 model online. Trying local cache. Error: {e}")
            try:
                self.processor = Sam3Processor.from_pretrained(self.model_id, token=self.hf_token, local_files_only=True)
                self.model = Sam3Model.from_pretrained(self.model_id, token=self.hf_token, local_files_only=True).to(self.device)
            except Exception as e2:
                print(f"Error: Failed to load SAM3 model from local cache also. {e2}")
                raise e2
        print("SAM3 model loaded successfully.")

    def segment(self, image_path: str, output_dir: str, **kwargs) -> List[str]:
        if not self.model:
            self.load_model()
            
        print(f"Segmenting {image_path}...")
        image = Image.open(image_path).convert("RGB")
        
        try:
            # SAM3 Promptable Concept Segmentation with text prompt "sticker"
            text_prompt = kwargs.get('text_prompt', 'sticker')
            inputs = self.processor(
                images=image, 
                text=text_prompt, 
                return_tensors="pt"
            ).to(self.device)
            
            with torch.no_grad():
                outputs = self.model(**inputs)
            
            # Post-process results using SAM3's post_process_instance_segmentation
            threshold = kwargs.get('score_threshold', 0.5)
            mask_threshold = kwargs.get('mask_threshold', 0.5)
            
            results = self.processor.post_process_instance_segmentation(
                outputs,
                threshold=threshold,
                mask_threshold=mask_threshold,
                target_sizes=inputs.get("original_sizes").tolist()
            )[0]  # First (and only) image in batch
            
            # DEBUG LOGGING
            with open("backend/error.log", "a") as f:
                f.write(f"\nDEBUG: Generated {len(results.get('masks', []))} masks\n")
                f.write(f"DEBUG: Scores: {results.get('scores', [])}\n")
                
        except Exception as e:
            msg = f"Error during segmentation: {e}\n"
            print(msg)
            with open("backend/error.log", "a") as f:
                f.write(msg)
                import traceback
                f.write(traceback.format_exc() + "\n")
            return []
        
        # Post-process results
        extracted_results = []
        
        try:
            masks = results.get('masks')
            scores = results.get('scores')
            boxes = results.get('boxes') # boxes are xyxy relative to original size? No, SAM returns absolute xyxy usually.
            
            if masks is None or len(masks) == 0:
                print("No masks generated")
                return [], None
                
            original_w, original_h = image.size
            min_area = kwargs.get('min_area', 1000)
            
            # Prepare overlay image
            overlay_image = image.copy().convert("RGBA")
            overlay_draw = Image.new("RGBA", image.size, (0,0,0,0))
            
            # Convert tensors to numpy
            masks_np = masks.cpu().numpy() if hasattr(masks, 'cpu') else np.array(masks)
            scores_np = scores.cpu().numpy() if hasattr(scores, 'cpu') else np.array(scores)
            
            # Sort by score descending
            sorted_indices = np.argsort(scores_np)[::-1]
            
            import random
            
            for idx in sorted_indices:
                mask = masks_np[idx]
                score = scores_np[idx]
                
                # Convert to binary
                mask_bool = mask > 0.5
                
                if not np.any(mask_bool): continue
                if np.sum(mask_bool) < min_area: continue
                
                mask_uint8 = (mask_bool * 255).astype(np.uint8)
                if mask_uint8.shape != (original_h, original_w):
                    mask_uint8 = cv2.resize(mask_uint8, (original_w, original_h), interpolation=cv2.INTER_NEAREST)
                
                # --- Artifact Filtering: Keep only Largest Component ---
                # This removes small floating pixels far away from the main sticker body
                num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
                if num_labels > 1:
                    # stats: [x, y, w, h, area]
                    # Label 0 is background, so we skip it.
                    # Find label with max area excluding 0
                    max_area = 0
                    max_label = -1
                    for i in range(1, num_labels):
                        if stats[i, cv2.CC_STAT_AREA] > max_area:
                            max_area = stats[i, cv2.CC_STAT_AREA]
                            max_label = i
                    
                    if max_label != -1:
                        # Create new mask with only the largest component
                        mask_uint8 = np.zeros_like(mask_uint8)
                        mask_uint8[labels == max_label] = 255
                # -----------------------------------------------------

                # Bounding box
                coords = cv2.findNonZero(mask_uint8)
                if coords is None: continue
                x, y, w, h = cv2.boundingRect(coords)
                
                if w < 20 or h < 20: continue
                
                # Crop & Save Sticker
                crop = image.crop((x, y, x+w, y+h))
                mask_crop = mask_uint8[y:y+h, x:x+w]
                mask_crop_img = Image.fromarray(mask_crop, mode='L')
                
                crop = crop.convert('RGBA')
                crop.putalpha(mask_crop_img)
                
                sticker_idx = len(extracted_results)
                filename = f"{os.path.basename(image_path)}_sticker_{sticker_idx}.png"
                save_path = os.path.join(output_dir, filename)
                crop.save(save_path)
                
                # Add to results
                extracted_results.append({
                    "path": save_path,
                    "box": [x, y, w, h],
                    "score": float(score)
                })
                
                # Draw on overlay
                # Random color with alpha
                color = (
                    random.randint(50, 255),
                    random.randint(50, 255),
                    random.randint(50, 255),
                    100 # Alpha
                )
                
                # Create a colored mask layer
                color_layer = Image.new("RGBA", (original_w, original_h), color)
                mask_pil = Image.fromarray(mask_uint8, mode='L')
                overlay_draw.paste(color_layer, (0, 0), mask_pil)
            
            # Composite overlay
            overlay_image = Image.alpha_composite(overlay_image, overlay_draw)
            
            # Save overlay
            overlay_filename = f"{os.path.basename(image_path)}_overlay.png"
            overlay_path = os.path.join(output_dir, overlay_filename)
            overlay_image.save(overlay_path)
            
            print(f"Extracted {len(extracted_results)} stickers and generated overlay.")
            
            return extracted_results, overlay_path

        except Exception as e:
            print(f"Error extracting masks: {e}")
            import traceback
            traceback.print_exc()
            return [], None

class MockSegmentator(BaseSegmentator):
    def load_model(self):
        print("Loading MOCK SAM 3 model...")
        time.sleep(1) # Simulate load
        print("Mock model loaded.")

    def segment(self, image_path: str, output_dir: str) -> tuple[List[dict], str]:
        print(f"Mock segmenting {image_path}...")
        time.sleep(2) # Simulate inference
        
        # Generate some dummy "stickers" (crops of the original image)
        image = Image.open(image_path)
        w, h = image.size
        
        results = []
        # Create 3 random crops
        for i in range(3):
            x = np.random.randint(0, w // 2)
            y = np.random.randint(0, h // 2)
            cw = np.random.randint(100, 300)
            ch = np.random.randint(100, 300)
            crop = image.crop((x, y, x+cw, y+ch))
            
            # Save
            filename = f"{os.path.basename(image_path)}_sticker_{i}.png"
            path = os.path.join(output_dir, filename)
            crop.save(path)
            results.append({
                "path": path,
                "box": [x, y, cw, ch],
                "score": 0.95
            })
            
        return results, image_path # Mock: utilize original image as overlay for simplicity

def get_segmentator(use_mock=False, hf_token=None):
    if use_mock:
        return MockSegmentator()
    return RealSegmentator(hf_token=hf_token)
