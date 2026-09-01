from .main import app
from .pulse import pulse_homelab


@app.get("/api/homelab")
def homelab() -> dict:
    return pulse_homelab()
