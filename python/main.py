from fastapi import FastAPI
from curve_fit import router as fit_router
from similarity import router as sim_router
from agent.routes import router as agent_router

app = FastAPI(title="AlgoLens Math Sidecar")

app.include_router(fit_router)
app.include_router(sim_router)
app.include_router(agent_router, prefix="/agent")


@app.get("/health")
def health():
    return {"status": "ok"}
