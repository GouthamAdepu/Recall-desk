"""ALL Hindsight Cloud logic lives here.

Hindsight is the single source of truth for customer memory. RecallDesk has
no database, no vector store, no chat log — every fact the assistant knows
about a customer is retained into, recalled from, or reflected on in Hindsight.

Memory model
------------
* One bank per customer:            bank_id = "customer-<id>"
* Bank mission + disposition tell Hindsight *what* to track and *how* to reason
  about it (empathetic, support-oriented).
* Every retained exchange is tagged so recall can be scoped:
      customer:<id>  issue:<category>  ticket:<id>  channel:<ch>  status:<state>
* Hindsight memory types surfaced in the UI:
      world        -> objective facts   ("Maya's router is a Netgear RAX50")
      experience   -> events/convos     ("Support promised a technician visit")
      observation  -> consolidated knowledge Hindsight derives over time

SDK reference (hindsight-client, Python):
    Hindsight(base_url, api_key, timeout)
    acreate_bank(bank_id, name, mission, disposition)
    aretain(bank_id, content, context, timestamp, document_id, metadata, tags)
    arecall(bank_id, query, types, max_tokens, budget, tags, tags_match)
    areflect(bank_id, query, budget, context)
If a signature changes in a future SDK release, only this file needs editing.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

from hindsight_client import Hindsight

from config import settings

log = logging.getLogger("recalldesk.memory")

BANK_MISSION = (
    "You are the long-term memory of a telecom / internet-provider customer support team. "
    "Track, for this one customer: their devices and plan, account details they've shared, "
    "every issue they've reported and how many times, which troubleshooting steps were tried "
    "and whether they worked, every promise support made (and whether it was kept), their "
    "emotional state over time, and whether each issue is open, escalated, or resolved."
)
BANK_DISPOSITION = {"skepticism": 2, "literalism": 3, "empathy": 5}


class MemoryUnavailable(Exception):
    """Raised when Hindsight cannot be reached; callers degrade gracefully."""


_client: Hindsight | None = None
_known_banks: set[str] = set()
_bank_lock = asyncio.Lock()


def get_client() -> Hindsight:
    global _client
    if _client is None:
        _client = Hindsight(
            base_url=settings.HINDSIGHT_API_URL,
            api_key=settings.HINDSIGHT_API_KEY or None,
            timeout=settings.HINDSIGHT_TIMEOUT,
        )
    return _client


async def close() -> None:
    if _client is not None and hasattr(_client, "aclose"):
        try:
            await _client.aclose()
        except Exception:  # pragma: no cover - best effort on shutdown
            pass


def bank_id_for(customer_id: str) -> str:
    """One memory bank per customer."""
    return f"customer-{customer_id.strip().lower()}"


def _slug(value: Any) -> str:
    return re.sub(r"[^a-z0-9_\-]+", "-", str(value).strip().lower()).strip("-")


# --------------------------------------------------------------------------
# SDK adapter: every call goes through here so failures are uniform.
# --------------------------------------------------------------------------
async def _call(method: str, **kwargs: Any) -> Any:
    client = get_client()
    fn = getattr(client, f"a{method}", None)
    try:
        if fn is not None:
            return await fn(**kwargs)
        return await asyncio.to_thread(getattr(client, method), **kwargs)
    except Exception as exc:
        msg = str(exc)
        not_found = "404" in msg or "not found" in msg.lower()
        # 404s are expected (health probe, brand-new banks) — keep logs clean.
        log.log(logging.DEBUG if not_found else logging.WARNING, "Hindsight %s failed: %s", method, msg.splitlines()[0])
        raise MemoryUnavailable(msg) from exc


def _field(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _normalize_result(r: Any) -> dict[str, Any]:
    entities = _field(r, "entities") or []
    return {
        "id": _field(r, "id"),
        "text": _field(r, "text", str(r)),
        "type": _field(r, "type") or "world",
        "mentioned_at": _iso(_field(r, "mentioned_at")),
        "occurred_at": _iso(_field(r, "occurred_start")),
        "entities": [e if isinstance(e, str) else (_field(e, "name") or str(e)) for e in entities],
        "tags": list(_field(r, "tags") or []),
    }


# --------------------------------------------------------------------------
# Public API used by the rest of the app
# --------------------------------------------------------------------------
async def ensure_bank(customer_id: str, name: str | None = None) -> str:
    """Create the customer's bank on first contact (idempotent).

    The mission + disposition shape how Hindsight extracts facts and how
    Reflect reasons — this is what makes summaries support-aware.
    """
    bank_id = bank_id_for(customer_id)
    if bank_id in _known_banks:
        return bank_id
    async with _bank_lock:
        if bank_id in _known_banks:
            return bank_id
        try:
            await _call(
                "create_bank",
                bank_id=bank_id,
                name=name or f"Customer {customer_id}",
                mission=BANK_MISSION,
                disposition=BANK_DISPOSITION,
            )
        except MemoryUnavailable as exc:
            msg = str(exc).lower()
            if not any(s in msg for s in ("exist", "409", "conflict", "duplicate")):
                raise
        _known_banks.add(bank_id)
    return bank_id


def build_tags(customer_id: str, facts: dict[str, Any]) -> list[str]:
    tags = [f"customer:{_slug(customer_id)}"]
    for key, prefix in (
        ("issue_category", "issue"),
        ("ticket_id", "ticket"),
        ("channel", "channel"),
        ("status", "status"),
    ):
        if facts.get(key):
            tags.append(f"{prefix}:{_slug(facts[key])}")
    return tags


async def remember(
    customer_id: str,
    customer_message: str,
    assistant_reply: str,
    facts: dict[str, Any] | None = None,
    timestamp: datetime | None = None,
    name: str | None = None,
) -> list[str]:
    """RETAIN one support exchange + structured facts.

    Hindsight extracts world facts / experiences from `content`; tags and
    metadata make the memory filterable by ticket, issue, channel and status.
    Returns the tags applied (shown in the UI).
    """
    bank_id = await ensure_bank(customer_id, name)
    facts = {k: v for k, v in (facts or {}).items() if v not in (None, "", [])}
    facts.setdefault("channel", "chat")
    ts = timestamp or datetime.now(timezone.utc)

    fact_lines = "\n".join(
        f"- {k.replace('_', ' ')}: {', '.join(map(str, v)) if isinstance(v, list) else v}"
        for k, v in facts.items()
    )
    content = (
        f"[{ts:%Y-%m-%d %H:%M} UTC · {facts['channel']}]\n"
        f"Customer said: {customer_message}\n"
        f"Support replied: {assistant_reply}\n"
        f"Structured facts about this contact:\n{fact_lines}"
    )
    tags = build_tags(customer_id, facts)
    await _call(
        "retain",
        bank_id=bank_id,
        content=content,
        context=f"customer support {facts['channel']} interaction",
        timestamp=ts,
        # One Hindsight document per exchange (re-using a document_id would replace
        # the earlier one). Ticket grouping comes from the ticket:<id> tag.
        document_id=f"{_slug(facts.get('ticket_id') or 'contact')}-{ts:%Y%m%dT%H%M%S}",
        metadata={k: str(v) for k, v in facts.items()},
        tags=tags,
    )
    return tags


async def remember_batch(
    customer_id: str,
    exchanges: list[tuple[datetime, str, str, str, dict[str, Any]]],
    name: str | None = None,
) -> None:
    """Queue a batch of historical support exchanges for seeding."""
    bank_id = await ensure_bank(customer_id, name)
    items: list[dict[str, Any]] = []
    for timestamp, channel, customer_message, assistant_reply, raw_facts in exchanges:
        facts = {k: v for k, v in raw_facts.items() if v not in (None, "", [])}
        facts.setdefault("channel", channel)
        fact_lines = "\n".join(
            f"- {k.replace('_', ' ')}: {', '.join(map(str, v)) if isinstance(v, list) else v}"
            for k, v in facts.items()
        )
        content = (
            f"[{timestamp:%Y-%m-%d %H:%M} UTC · {facts['channel']}]\n"
            f"Customer said: {customer_message}\n"
            f"Support replied: {assistant_reply}\n"
            f"Structured facts about this contact:\n{fact_lines}"
        )
        items.append(
            {
                "content": content,
                "context": f"customer support {facts['channel']} interaction",
                "timestamp": timestamp,
                "document_id": f"{_slug(facts.get('ticket_id') or 'contact')}-{timestamp:%Y%m%dT%H%M%S}",
                "metadata": {k: str(v) for k, v in facts.items()},
                "tags": build_tags(customer_id, facts),
            }
        )
    if items:
        await _call("retain_batch", bank_id=bank_id, items=items, retain_async=True)


async def recall(
    customer_id: str,
    query: str,
    *,
    types: list[str] | None = None,
    issue: str | None = None,
    max_results: int = 12,
    budget: str | None = None,
) -> list[dict[str, Any]]:
    """RECALL memories relevant to `query` from the customer's bank.

    Optionally scoped to one issue category via tags (untagged memories still
    match with tags_match="any", so nothing important is filtered away).
    """
    bank_id = await ensure_bank(customer_id)
    kwargs: dict[str, Any] = {
        "bank_id": bank_id,
        "query": query,
        "max_tokens": 4096,
        "budget": budget or settings.HINDSIGHT_RECALL_BUDGET,
    }
    if types:
        kwargs["types"] = types
    if issue:
        kwargs["tags"] = [f"issue:{_slug(issue)}"]
        kwargs["tags_match"] = "any"
    resp = await _call("recall", **kwargs)
    results = _field(resp, "results", resp) or []
    return [_normalize_result(r) for r in list(results)[:max_results]]


async def summarize(customer_id: str, focus: str | None = None) -> str:
    """REFLECT: Hindsight reasons over the full history and writes a briefing."""
    bank_id = await ensure_bank(customer_id)
    query = (
        "Write a concise briefing (3-5 sentences) for a support agent about to reply to this customer. "
        "State how many times they've contacted us and about which issues, which troubleshooting steps "
        "were already tried and failed, any promises support made and whether they were kept, their "
        "current mood, and which issues are open, escalated or resolved. If there is no history, say "
        "'No prior history — new customer.'"
    )
    resp = await _call(
        "reflect",
        bank_id=bank_id,
        query=query,
        budget=settings.HINDSIGHT_REFLECT_BUDGET,
        context=f"The customer just wrote: {focus}" if focus else "Reviewing customer history",
    )
    return (_field(resp, "text", str(resp)) or "").strip()


async def handoff_briefing(customer_id: str) -> str:
    """REFLECT (deep): a structured handoff note for a human tier-2 agent."""
    bank_id = await ensure_bank(customer_id)
    query = (
        "Produce a tier-2 escalation handoff for a human specialist. Use these exact section headers, "
        "each followed by short bullet points:\n"
        "CUSTOMER SNAPSHOT\nISSUE TIMELINE\nALREADY TRIED (DO NOT REPEAT)\nOPEN PROMISES\n"
        "CUSTOMER SENTIMENT\nRECOMMENDED NEXT ACTION"
    )
    resp = await _call(
        "reflect", bank_id=bank_id, query=query, budget="mid", context="escalation handoff to a human agent"
    )
    return (_field(resp, "text", str(resp)) or "").strip()


async def ping() -> bool:
    """Is Hindsight reachable? A 404 on an unknown bank still proves connectivity."""
    try:
        await _call("recall", bank_id="recalldesk-healthcheck", query="ping", budget="low", max_tokens=64)
        return True
    except MemoryUnavailable as exc:
        return any(s in str(exc).lower() for s in ("404", "not found"))


# --------------------------------------------------------------------------
# Memory Explorer: browse the raw bank — memories, source documents, the
# memory graph (links) and entities.
#
# These use Hindsight's documented REST API directly (Authorization: Bearer)
# because not every browse endpoint has a documented SDK helper:
#   GET /v1/default/banks/{bank}/memories/list   ?type&q&document_id&limit&offset
#   GET /v1/default/banks/{bank}/documents       /documents/{document_id}
#   GET /v1/default/banks/{bank}/graph           ?type&limit&q  -> nodes + edges (linkType, weight)
#   GET /v1/default/banks/{bank}/entities
#   GET /v1/default/banks/{bank}/stats
# Responses are normalized defensively so field-name drift doesn't break the UI.
# --------------------------------------------------------------------------
import httpx  # noqa: E402

_http: httpx.AsyncClient | None = None


def _http_client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        headers = {"Accept": "application/json"}
        if settings.HINDSIGHT_API_KEY:
            headers["Authorization"] = f"Bearer {settings.HINDSIGHT_API_KEY}"
        _http = httpx.AsyncClient(
            base_url=settings.HINDSIGHT_API_URL.rstrip("/"), headers=headers, timeout=settings.HINDSIGHT_TIMEOUT
        )
    return _http


async def close_http() -> None:
    if _http is not None:
        await _http.aclose()


async def _rest(path: str, params: dict[str, Any] | None = None) -> Any:
    clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    try:
        resp = await _http_client().get(path, params=clean)
    except httpx.HTTPError as exc:
        raise MemoryUnavailable(str(exc)) from exc
    if resp.status_code == 404:
        return None
    if resp.status_code >= 400:
        raise MemoryUnavailable(f"{resp.status_code}: {resp.text[:200]}")
    return resp.json()


def _bank_path(customer_id: str, suffix: str) -> str:
    return f"/v1/default/banks/{bank_id_for(customer_id)}/{suffix}"


def _items(payload: Any, *keys: str) -> list:
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    for k in (*keys, "items", "results", "data"):
        if isinstance(payload.get(k), list):
            return payload[k]
    return []


def _memory_row(m: dict) -> dict[str, Any]:
    ents = m.get("entities") or []
    if isinstance(ents, str):
        ents = [e.strip() for e in ents.split(",") if e.strip()]
    return {
        "id": m.get("id"),
        "text": m.get("text") or m.get("content") or "",
        "type": m.get("fact_type") or m.get("type") or "world",
        "context": m.get("context"),
        "document_id": m.get("document_id"),
        "mentioned_at": _iso(m.get("mentioned_at") or m.get("date")),
        "occurred_at": _iso(m.get("occurred_start")),
        "entities": [e if isinstance(e, str) else (e.get("name") or e.get("canonical_name") or str(e)) for e in ents],
        "tags": m.get("tags") or [],
    }


async def list_memories(
    customer_id: str, *, type: str | None = None, q: str | None = None,
    document_id: str | None = None, limit: int = 50, offset: int = 0,
) -> dict[str, Any]:
    data = await _rest(
        _bank_path(customer_id, "memories/list"),
        {"type": type, "q": q, "document_id": document_id, "limit": limit, "offset": offset},
    )
    items = [_memory_row(m) for m in _items(data)]
    total = (data or {}).get("total", len(items)) if isinstance(data, dict) else len(items)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


async def list_documents(customer_id: str) -> list[dict[str, Any]]:
    data = await _rest(_bank_path(customer_id, "documents"), {"limit": 100})
    docs = []
    for d in _items(data, "documents"):
        docs.append({
            "id": d.get("id") or d.get("document_id"),
            "preview": (d.get("original_text") or d.get("text") or "")[:220],
            "created_at": _iso(d.get("created_at") or d.get("updated_at")),
            "memory_count": d.get("memory_unit_count") or d.get("fact_count") or d.get("memory_count"),
            "chunk_count": d.get("chunk_count"),
            "tags": d.get("tags") or [],
        })
    return docs


async def get_document(customer_id: str, document_id: str) -> dict[str, Any] | None:
    d = await _rest(_bank_path(customer_id, f"documents/{document_id}"))
    if d is None:
        return None
    # Facts Hindsight extracted from this document (the doc → memory links).
    mems = await list_memories(customer_id, document_id=document_id, limit=100)
    return {
        "id": d.get("id") or document_id,
        "original_text": d.get("original_text") or d.get("text") or "",
        "created_at": _iso(d.get("created_at")),
        "tags": d.get("tags") or [],
        "memories": mems["items"],
    }


async def graph(customer_id: str, *, type: str | None = None, limit: int = 150) -> dict[str, Any]:
    """The bank's memory graph: memory units as nodes, links as edges.

    Link types: entity (share an entity), temporal (close in time),
    semantic (similar meaning), plus any others Hindsight adds (e.g. causal).
    """
    data = await _rest(_bank_path(customer_id, "graph"), {"type": type, "limit": limit}) or {}
    nodes, edges = [], []
    for n in data.get("nodes", []):
        n = n.get("data", n)
        nodes.append({
            "id": str(n.get("id")),
            "label": n.get("label") or (n.get("text") or "")[:40],
            "text": n.get("text") or n.get("label") or "",
            "type": n.get("fact_type") or n.get("type") or n.get("group") or "world",
        })
    ids = {n["id"] for n in nodes}
    for e in data.get("edges", []):
        e = e.get("data", e)
        s, t = str(e.get("source")), str(e.get("target"))
        if s in ids and t in ids and s != t:
            edges.append({
                "source": s,
                "target": t,
                "type": e.get("linkType") or e.get("link_type") or e.get("type") or "semantic",
                "weight": float(e.get("weight") or 0.5),
            })
    return {"nodes": nodes, "edges": edges, "total_units": data.get("total_units", len(nodes))}


async def list_entities(customer_id: str) -> list[dict[str, Any]]:
    data = await _rest(_bank_path(customer_id, "entities"), {"limit": 100})
    out = []
    for e in _items(data, "entities"):
        out.append({
            "id": e.get("id"),
            "name": e.get("canonical_name") or e.get("name") or str(e.get("id")),
            "mentions": e.get("mention_count") or e.get("count") or 0,
        })
    return sorted(out, key=lambda e: -(e["mentions"] or 0))


async def bank_stats(customer_id: str) -> dict[str, Any]:
    data = await _rest(_bank_path(customer_id, "stats")) or {}
    # Keep flat numeric fields + one level of nested counts (e.g. by fact type / link type).
    flat: dict[str, Any] = {}
    for k, v in data.items():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            flat[k] = v
        elif isinstance(v, dict):
            for k2, v2 in v.items():
                if isinstance(v2, (int, float)) and not isinstance(v2, bool):
                    flat[f"{k}.{k2}"] = v2
    return flat
