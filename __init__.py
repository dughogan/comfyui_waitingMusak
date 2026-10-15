"""waitingMusak: elevator music for ComfyUI, plus the read-only Comfy Monitor."""
import logging

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

try:
    from .monitor import install
    install()
except Exception:
    logging.getLogger("waitingMusak").exception("[waitingMusak] Comfy Monitor failed to start")

__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
