"""RecallDesk FastAPI app.

The request pipeline (streamed live to the UI over Server-Sent Events):

    identify ─▶ RECALL + REFLECT (Hindsight, parallel) ─▶ triage ─▶ generate (streamed)
             ─▶ extract facts ─▶ RETAIN (Hindsight) ─▶ done
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import assistant
import customers
import memory
from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("recalldesk")


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await memory.close()
    await memory.close_http()


app = FastAPI(title="RecallDesk", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)

# Live demo counters (process-local telemetry, NOT customer memory).
STATS = {
    "conversations": 0,
    "memories_recalled": 0,
    "memories_retained": 0,
    "escalations": 0,
    "repeat_issues_recognized": 0,
    "questions_not_reasked": 0,
}


class ChatRequest(BaseModel):
    customer_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=4000)
    channel: str = Field(default="chat", max_length=32)


def _clean_id(customer_id: str) -> str:
    cid = customer_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9_\-@.+ ]+", cid):
        raise HTTPException(400, "Invalid customer identifier")
    return customers.resolve(cid)["id"]


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _new_ticket_id() -> str:
    return f"T-{random.randint(10000, 99999)}"


# ---------------------------------------------------------------------------
# Core pipeline (async generator of (event, data) tuples)
# ---------------------------------------------------------------------------
async def run_pipeline(req: ChatRequest) -> AsyncIterator[tuple[str, Any]]:
    started = time.perf_counter()
    profile = customers.resolve(req.customer_id)
    cid = profile["id"]
    STATS["conversations"] += 1

    # 1. Identify → maps to the customer's dedicated Hindsight bank.
    yield "stage", {"stage": "identify", "status": "done", "detail": f"bank {memory.bank_id_for(cid)}"}

    # 2+3. RECALL relevant memories and REFLECT on history — in parallel.
    memory_ok, memories, summary = True, [], ""
    yield "stage", {"stage": "recall", "status": "active"}
    yield "stage", {"stage": "reflect", "status": "active"}
    t0 = time.perf_counter()
    try:
        await memory.ensure_bank(cid, profile.get("name"))
        memories, summary = await asyncio.gather(
            memory.recall(cid, req.message), memory.summarize(cid, focus=req.message)
        )
        STATS["memories_recalled"] += len(memories)
    except memory.MemoryUnavailable as exc:
        memory_ok = False
        yield "memory_error", {"message": str(exc)[:200]}
    ms = int((time.perf_counter() - t0) * 1000)
    yield "memories", {"memories": memories, "available": memory_ok}
    yield "summary", {"summary": summary, "available": memory_ok}
    yield "stage", {"stage": "recall", "status": "done" if memory_ok else "error", "detail": f"{len(memories)} memories · {ms} ms"}
    yield "stage", {"stage": "reflect", "status": "done" if memory_ok else "error", "detail": f"{ms} ms"}

    # 4a. Triage: repeat detection, sentiment, escalation decision.
    yield "stage", {"stage": "triage", "status": "active"}
    t = await assistant.triage(req.message, memories, summary, memory_ok)
    ticket_id = t.get("existing_ticket_id") or _new_ticket_id()
    t["ticket_id"] = ticket_id
    if t["is_repeat_issue"]:
        STATS["repeat_issues_recognized"] += 1
    STATS["questions_not_reasked"] += len(t["known_details"])
    if t["escalate"]:
        STATS["escalations"] += 1
    yield "triage", t
    yield "stage", {
        "stage": "triage",
        "status": "done",
        "detail": f"contact #{t['contact_number']} · {t['sentiment']}" + (" · ESCALATE" if t["escalate"] else ""),
    }

    # 4b. Generate the reply, streaming tokens to the UI.
    yield "stage", {"stage": "generate", "status": "active"}
    prompt = assistant.reply_prompt(req.message, memories, summary, memory_ok, t, ticket_id)
    parts: list[str] = []
    async for token in assistant.stream(assistant.REPLY_SYSTEM_PROMPT, prompt):
        parts.append(token)
        yield "token", {"text": token}
    reply = "".join(parts).strip()
    yield "stage", {"stage": "generate", "status": "done", "detail": f"{len(reply.split())} words"}

    # 5. RETAIN: extract facts, then write the exchange back into Hindsight.
    yield "stage", {"stage": "retain", "status": "active"}
    facts = await assistant.extract_facts(req.message, reply, t, ticket_id)
    facts["channel"] = req.channel
    tags: list[str] = []
    if memory_ok:
        try:
            tags = await memory.remember(cid, req.message, reply, facts, name=profile.get("name"))
            STATS["memories_retained"] += 1
            yield "stage", {"stage": "retain", "status": "done", "detail": f"{len(tags)} tags"}
        except memory.MemoryUnavailable:
            memory_ok = False
            yield "stage", {"stage": "retain", "status": "error", "detail": "Hindsight unreachable"}
    else:
        yield "stage", {"stage": "retain", "status": "error", "detail": "skipped — memory offline"}

    yield "done", {
        "reply": reply,
        "facts": facts,
        "tags": tags,
        "triage": t,
        "memory_available": memory_ok,
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "hindsight": "reachable" if await memory.ping() else "unreachable",
        "llm_provider": settings.LLM_PROVIDER,
        "llm_model": settings.LLM_MODEL,
    }


@app.get("/stats")
async def stats():
    return STATS


@app.get("/customers")
async def list_customers():
    return customers.DEMO_CUSTOMERS


@app.get("/customers/{customer_id}")
async def get_customer(customer_id: str):
    return customers.resolve(_clean_id(customer_id))


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    req.customer_id = _clean_id(req.customer_id)

    async def gen():
        try:
            async for event, data in run_pipeline(req):
                yield _sse(event, data)
        except Exception as exc:  # surface LLM/config errors to the UI
            log.exception("pipeline failed")
            yield _sse("error", {"message": str(exc)[:300]})

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.post("/chat")
async def chat(req: ChatRequest):
    """Non-streaming variant matching the original contract."""
    req.customer_id = _clean_id(req.customer_id)
    memories, summary, result = [], "", None
    try:
        async for event, data in run_pipeline(req):
            if event == "memories":
                memories = data["memories"]
            elif event == "summary":
                summary = data["summary"]
            elif event == "done":
                result = data
    except Exception as exc:
        log.exception("chat failed")
        raise HTTPException(502, f"Assistant error: {exc}") from exc
    return {"recalled_memories": memories, "summary": summary, **(result or {})}


@app.post("/chat/compare")
async def chat_compare(req: ChatRequest):
    """Side-by-side demo: the same message answered WITH and WITHOUT Hindsight memory.

    Read-only — nothing is retained, so it can be run repeatedly on stage.
    """
    cid = _clean_id(req.customer_id)
    memory_ok, memories, summary = True, [], ""
    try:
        memories, summary = await asyncio.gather(memory.recall(cid, req.message), memory.summarize(cid, req.message))
    except memory.MemoryUnavailable:
        memory_ok = False
    t = await assistant.triage(req.message, memories, summary, memory_ok)
    ticket = t.get("existing_ticket_id") or "T-NEW"
    with_memory, without_memory = await asyncio.gather(
        assistant.complete(
            assistant.REPLY_SYSTEM_PROMPT, assistant.reply_prompt(req.message, memories, summary, memory_ok, t, ticket),
            max_tokens=2048,
        ),
        assistant.amnesia_reply(req.message),
    )
    return {
        "with_memory": with_memory.strip(),
        "without_memory": without_memory.strip(),
        "memories_used": len(memories),
        "triage": t,
        "memory_available": memory_ok,
    }


@app.get("/customers/{customer_id}/summary")
async def customer_summary(customer_id: str):
    cid = _clean_id(customer_id)
    try:
        return {"summary": await memory.summarize(cid), "memory_available": True}
    except memory.MemoryUnavailable:
        return {"summary": "", "memory_available": False}


@app.get("/customers/{customer_id}/memories")
async def customer_memories(
    customer_id: str, q: str = "support history, issues, devices, promises, resolutions", type: str | None = None, issue: str | None = None
):
    cid = _clean_id(customer_id)
    types = [type] if type in ("world", "experience", "observation") else None
    try:
        mems = await memory.recall(cid, q, types=types, issue=issue, max_results=40, budget="mid")
        return {"memories": mems, "memory_available": True}
    except memory.MemoryUnavailable:
        return {"memories": [], "memory_available": False}


@app.get("/customers/{customer_id}/briefing")
async def customer_briefing(customer_id: str):
    """Tier-2 handoff note, generated by Hindsight Reflect."""
    cid = _clean_id(customer_id)
    try:
        return {"briefing": await memory.handoff_briefing(cid), "memory_available": True}
    except memory.MemoryUnavailable:
        return {"briefing": "", "memory_available": False}


# ---------------------------------------------------------------------------
# Memory Explorer — browse the customer's raw Hindsight bank
# ---------------------------------------------------------------------------
def _unavailable(key: str, empty: Any):
    return {key: empty, "memory_available": False}


@app.get("/customers/{customer_id}/bank/memories")
async def bank_memories(
    customer_id: str, type: str | None = None, q: str | None = None,
    document_id: str | None = None, limit: int = 50, offset: int = 0,
):
    cid = _clean_id(customer_id)
    try:
        return {**await memory.list_memories(cid, type=type, q=q, document_id=document_id,
                                             limit=min(limit, 200), offset=offset), "memory_available": True}
    except memory.MemoryUnavailable:
        return {"items": [], "total": 0, "memory_available": False}


@app.get("/customers/{customer_id}/bank/documents")
async def bank_documents(customer_id: str):
    cid = _clean_id(customer_id)
    try:
        return {"documents": await memory.list_documents(cid), "memory_available": True}
    except memory.MemoryUnavailable:
        return _unavailable("documents", [])


@app.get("/customers/{customer_id}/bank/documents/{document_id}")
async def bank_document(customer_id: str, document_id: str):
    cid = _clean_id(customer_id)
    try:
        doc = await memory.get_document(cid, document_id)
    except memory.MemoryUnavailable:
        return _unavailable("document", None)
    if doc is None:
        raise HTTPException(404, "Document not found")
    return {"document": doc, "memory_available": True}


@app.get("/customers/{customer_id}/bank/graph")
async def bank_graph(customer_id: str, type: str | None = None, limit: int = 150):
    cid = _clean_id(customer_id)
    try:
        return {**await memory.graph(cid, type=type, limit=min(limit, 400)), "memory_available": True}
    except memory.MemoryUnavailable:
        return {"nodes": [], "edges": [], "memory_available": False}


@app.get("/customers/{customer_id}/bank/entities")
async def bank_entities(customer_id: str):
    cid = _clean_id(customer_id)
    try:
        return {"entities": await memory.list_entities(cid), "memory_available": True}
    except memory.MemoryUnavailable:
        return _unavailable("entities", [])


@app.get("/customers/{customer_id}/bank/stats")
async def bank_stats(customer_id: str):
    cid = _clean_id(customer_id)
    try:
        return {"stats": await memory.bank_stats(cid), "bank_id": memory.bank_id_for(cid), "memory_available": True}
    except memory.MemoryUnavailable:
        return _unavailable("stats", {})
