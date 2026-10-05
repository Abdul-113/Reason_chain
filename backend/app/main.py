import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routes import health, ingestion, graph, investigation, workspace, firebase, mapping, resolution

# Configure structured logging for the ingestion pipeline
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="ReasonChain Enterprise Reasoning Platform API",
    version="0.1.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(health.router, prefix=settings.API_V1_STR, tags=["Health"])
app.include_router(ingestion.router, prefix=f"{settings.API_V1_STR}/ingestion", tags=["Ingestion"])
app.include_router(firebase.router, prefix=f"{settings.API_V1_STR}/firebase", tags=["Firebase Ingestion"])
app.include_router(mapping.router, prefix="", tags=["AI-Assisted Semantic Mapping"])
app.include_router(resolution.router, prefix="", tags=["Entity Resolution & Identity Management"])
app.include_router(graph.router, prefix=f"{settings.API_V1_STR}/graph", tags=["Knowledge Graph"])
app.include_router(investigation.router, prefix=f"{settings.API_V1_STR}/investigation", tags=["Investigation"])
app.include_router(workspace.router, prefix=f"{settings.API_V1_STR}/workspace", tags=["Workspace"])

@app.get("/")
def root_redirect():
    return {"message": "ReasonChain Backend Service Operational", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
