import asyncio
import os
from .state import state
from .clustering import run_clustering_task
# Check imports based on execution context.
# If running as module, relative imports work.

async def segmentation_worker():
    print("Worker started. Waiting for tasks...")
    while True:

        try:
            item = await state.queue.get()
            task_id = item.task_id
            priority = item.priority
            
            task = state.tasks.get(task_id)
            if not task:
                # Task removed?
                state.queue.task_done()
                continue
                
            # Check if task is already done/processing
            if task.status != "pending":
                state.queue.task_done()
                continue
                
            print(f"Processing task {task_id} with priority {priority}")
            task.status = "processing"
            
            # Output directory
            base_dir = os.path.dirname(__file__)
            output_dir = os.path.join(base_dir, "static", "results", task_id)
            os.makedirs(output_dir, exist_ok=True)
            
            # Run segmentation
            if not state.segmentator:
                print("Error: Segmentator not initialized.")
                task.status = "failed"
                task.error = "Segmentator not initialized"
                state.queue.task_done()
                continue

            # Resolve image path
            image_path = task.image_path
            if image_path.startswith("/static/"):
                image_path = os.path.join(base_dir, image_path.lstrip("/"))
                
            loop = asyncio.get_running_loop()
            results, overlay_path = await loop.run_in_executor(
                None, 
                lambda: state.segmentator.segment(
                    image_path, 
                    output_dir, 
                    iou_threshold=task.iou_threshold, 
                    score_threshold=task.score_threshold
                )
            )
            
            task.result_paths = results
            task.overlay_path = f"/static/results/{task_id}/{os.path.basename(overlay_path)}" if overlay_path else None
            task.status = "completed"
            
            # Convert paths to relative URLS
            relative_results = []
            for item in results:
                path = item["path"]
                filename = os.path.basename(path)
                relative_results.append({
                    **item,
                    "path": f"/static/results/{task_id}/{filename}"
                })
            
            task.result_paths = relative_results
            task.result_paths = relative_results
            print(f"Task {task_id} completed.")
            state.save_tasks_db() # Persist state

            
        except asyncio.CancelledError:
            print("Worker cancelled.")
            break
        except Exception as e:
            import traceback
            error_msg = f"Task {item.task_id if 'item' in locals() else 'unknown'} failed: {e}\n{traceback.format_exc()}"
            print(error_msg)
            with open("backend/error.log", "a") as f:
                f.write(error_msg + "\n" + "-"*80 + "\n")
            
            if 'task' in locals() and task:
                task.error = str(e)
                task.status = "failed"
        finally:
            # Ensure task_done is called if we got an item
            if 'item' in locals():
                state.queue.task_done()

            # Check for completion
            if state.queue.empty():
                processing_count = sum(1 for t in state.tasks.values() if t.status == "processing")
                # print(f"[Worker] Queue empty. Processing count: {processing_count}")
                if processing_count == 0:
                    print("All tasks completed. Triggering clustering...")
                    # Since run_clustering_task is async and manages its own executors, 
                    # we just schedule it on the loop.
                    asyncio.create_task(run_clustering_task(min_cluster_size=2))

