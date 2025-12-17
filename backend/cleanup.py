
from backend.state import state
import os

print("Starting cleanup...")
state.cleanup_temporary_files()
print("Cleanup done. Hash DB and Embedding Cache cleared.")
