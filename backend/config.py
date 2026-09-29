"""Environment configuration for RecallDesk."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project root (recalldesk/.env), falling back to CWD.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()


class Settings:
    HINDSIGHT_API_KEY: str = os.getenv("HINDSIGHT_API_KEY", "")
    HINDSIGHT_API_URL: str = os.getenv("HINDSIGHT_API_URL", "https://api.hindsight.vectorize.io")
    HINDSIGHT_TIMEOUT: float = float(os.getenv("HINDSIGHT_TIMEOUT", "30"))
    # Budget controls how hard Hindsight searches/reasons: low | mid | high
    HINDSIGHT_RECALL_BUDGET: str = os.getenv("HINDSIGHT_RECALL_BUDGET", "mid")
    HINDSIGHT_REFLECT_BUDGET: str = os.getenv("HINDSIGHT_REFLECT_BUDGET", "low")

    # "openai" (any OpenAI-compatible endpoint) or "anthropic"
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai").lower()
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")
    # Optional cheaper/faster model for triage + fact extraction (defaults to LLM_MODEL)
    LLM_FAST_MODEL: str = os.getenv("LLM_FAST_MODEL", "") or os.getenv("LLM_MODEL", "openai/gpt-oss-120b")
    LLM_BASE_URL: str | None = os.getenv("LLM_BASE_URL") or "https://api.groq.com/openai/v1"
    # For reasoning models (e.g. Groq openai/gpt-oss-120b): low | medium | high.
    # Hidden reasoning counts against max_tokens, so "low" keeps replies fast and complete.
    LLM_REASONING_EFFORT: str | None = os.getenv("LLM_REASONING_EFFORT", "low") or None
    # Use response_format={"type":"json_object"} for triage / fact extraction (OpenAI-compatible only)
    LLM_JSON_MODE: bool = os.getenv("LLM_JSON_MODE", "true").lower() in ("1", "true", "yes")

    # Escalate automatically once the same issue reaches this many contacts
    ESCALATION_THRESHOLD: int = int(os.getenv("ESCALATION_THRESHOLD", "3"))

    CORS_ORIGINS: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    ]


settings = Settings()
