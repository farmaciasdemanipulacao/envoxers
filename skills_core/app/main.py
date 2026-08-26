from fastapi import FastAPI

app = FastAPI(title="Envox Skills Core", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "envox-skills-core", "version": "0.1.0"}

@app.get("/v1/meta")
def meta():
    return {
        "name": "Envox Skills",
        "stage": "foundation",
        "client_pilot": "SECOVI-PR",
        "ai_execution_enabled": False,
        "modules": ["brain", "agents", "router", "knowledge", "feature_flags", "evals"],
    }
