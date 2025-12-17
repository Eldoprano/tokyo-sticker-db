import os
import torch
from transformers import AutoModel, AutoProcessor
from PIL import Image

try:
    print("Loading model...")
    processor = AutoProcessor.from_pretrained("facebook/sam3", token=os.getenv("HF_TOKEN"))
    model = AutoModel.from_pretrained("facebook/sam3", token=os.getenv("HF_TOKEN"))
    print("Model loaded.")

    print(f"Model class: {type(model)}")
    print(f"Model methods: {[m for m in dir(model) if 'inference' in m]}")

    # Create dummy image
    image = Image.new("RGB", (512, 512), color="red")
    print("Processing image...")
    inputs = processor(images=image, return_tensors="pt")
    
    print("Inputs keys:", inputs.keys())
    
    # Try forward with default
    print("Attempting forward pass...")
    try:
        outputs = model(**inputs)
        print("Success!")
    except Exception as e:
        print(f"Forward failed: {e}")
        
    # Check for inference session
    if hasattr(model, 'init_inference_session'):
        print("Initializing inference session...")
        inference_session = model.init_inference_session()
        print("Session created.")
        
        # Try forward with session
        print("Attempting forward pass with inference_session...")
        try:
            outputs = model(**inputs, inference_session=inference_session)
            print("Success with session!")
            print("Output keys:", outputs.keys())
        except Exception as e:
            print(f"Forward with session failed: {e}")

except Exception as e:
    print(f"Crash: {e}")
