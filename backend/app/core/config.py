import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from workspace root and backend directory
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
workspace_root = os.path.dirname(backend_dir)
for candidate in [os.path.join(workspace_root, ".env"), os.path.join(backend_dir, ".env"), ".env"]:
    if os.path.exists(candidate):
        load_dotenv(candidate, override=False)

class Settings(BaseSettings):
    PROJECT_NAME: str = "ReasonChain Backend"
    API_V1_STR: str = "/api"

    # Server configuration
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8000))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # PostgreSQL Connection Settings
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", 5432))
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "reasonchain_demo")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")

    # Neo4j Graph Database Connection Settings
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USERNAME: str = os.getenv("NEO4J_USERNAME", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "password")
    NEO4J_DATABASE: str = os.getenv("NEO4J_DATABASE", "neo4j")

    # Firebase Realtime Database Connection Settings (server-side only)
    FIREBASE_DATABASE_URL: str = os.getenv("FIREBASE_DATABASE_URL", "")
    FIREBASE_SERVICE_ACCOUNT_JSON_PATH: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON_PATH", "")

    # AI-Assisted Semantic Mapping Settings (server-side only — NEVER expose to frontend)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "")
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")
    AI_MODEL: str = os.getenv("AI_MODEL", "")
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "")

    class Config:
        env_file = (
            os.path.join(workspace_root, ".env"),
            os.path.join(backend_dir, ".env"),
            ".env",
        )
        extra = "ignore"

settings = Settings()
