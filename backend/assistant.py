"""LLM layer: triage, streaming reply generation, and fact extraction.

Supports Anthropic and any OpenAI-compatible API via LLM_PROVIDER / LLM_BASE_URL.
Default setup: Groq (https://api.groq.com/openai/v1) with openai/gpt-oss-120b.
"""
from __future__ import annotations

import json
import re
from typing import Any, AsyncIterator

from config import settings

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
REPLY_SYSTEM_PROMPT = """You are RecallDesk, a warm, sharp customer support agent for Nimbus Fiber, an internet/telecom provider.

Unlike most support agents, you REMEMBER this customer. You are given:
- a Hindsight reflection summarizing their history,
- specific recalled memories,
- a triage analysis of the new message.

Rules:
1. Open by acknowledging relevant history naturally and specifically ("I can see this is the third time you've reached out about your connection dropping in the evenings — I'm sorry."). Never say "according to my records" or mention "memories".
2. NEVER ask for information the customer already gave (device model, plan, account number, address...). Use it.
3. NEVER suggest a troubleshooting step that was already tried. Advance to the next step.
4. If a promise was made and not kept, own it explicitly and fix it.
5. If triage says ESCALATE: apologize, clearly state you're escalating to a senior specialist, give a concrete commitment (what happens, by when), and reference the ticket ID.
6. Match the customer's emotional state: calm & efficient for neutral, extra empathy for frustrated.
7. New customer with no history: be welcoming and ask only for the minimum info needed.
8. Keep it under 130 words. Plain text, no markdown headings, at most a short list if giving steps."""

AMNESIA_SYSTEM_PROMPT = """You are a customer support agent for Nimbus Fiber, an internet/telecom provider.
You have no information about this customer. Reply helpfully in under 110 words, plain text."""

TRIAGE_SYSTEM_PROMPT = """You are a support triage engine. Given a customer's new message and what memory says about their history, output ONLY a JSON object:
{
  "issue_category": "wifi" | "outage" | "speed" | "billing" | "hardware" | "account" | "cancellation" | "other",
  "sentiment": "positive" | "neutral" | "frustrated" | "angry",
  "urgency": "low" | "medium" | "high",
  "is_repeat_issue": boolean,             // same issue has been raised before
  "prior_contacts_on_issue": integer,     // contacts about THIS issue BEFORE this message
  "existing_ticket_id": string | null,    // reuse if the issue already has a ticket
  "already_tried": [string],              // steps that were tried and failed
  "open_promises": [string],              // commitments support made that are still pending
  "known_details": [string],              // facts the agent must NOT ask for again
  "churn_risk": "low" | "medium" | "high",
  "reasoning": string                     // one sentence
}"""

FACTS_SYSTEM_PROMPT = """Extract structured facts from this support exchange. Output ONLY a JSON object:
{
  "issue_category": string,
  "device": string | null,
  "plan": string | null,
  "status": "open" | "escalated" | "resolved",
  "resolution": string | null,
  "steps_suggested": [string],
  "promises_made": [string],
  "notes": string            // one-sentence summary of this contact
}"""


# ---------------------------------------------------------------------------
# Provider plumbing
# ---------------------------------------------------------------------------
_anthropic = None
_openai = None


def _anthropic_client():
    global _anthropic
    if _anthropic is None:
        from anthropic import AsyncAnthropic

        _anthropic = AsyncAnthropic(api_key=settings.LLM_API_KEY)
    return _anthropic


def _openai_client():
    global _openai
    if _openai is None:
        from openai import AsyncOpenAI

        _openai = AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
    return _openai


def _openai_extra(max_tokens: int) -> dict[str, Any]:
    """Extra args for OpenAI-compatible providers (Groq, OpenAI, ...)."""
    extra: dict[str, Any] = {"max_tokens": max_tokens}
    if settings.LLM_REASONING_EFFORT:
        extra["reasoning_effort"] = settings.LLM_REASONING_EFFORT
    return extra


async def complete(
    system: str, user: str, *, model: str | None = None, max_tokens: int = 800, json_mode: bool = False
) -> str:
    model = model or settings.LLM_MODEL
    if settings.LLM_PROVIDER == "anthropic":
        resp = await _anthropic_client().messages.create(
            model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}]
        )
        return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    kwargs = _openai_extra(max_tokens)
    if json_mode and settings.LLM_JSON_MODE:
        kwargs["response_format"] = {"type": "json_object"}
    resp = await _openai_client().chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        **kwargs,
    )
    return resp.choices[0].message.content or ""


async def stream(system: str, user: str, *, max_tokens: int = 2048) -> AsyncIterator[str]:
    if settings.LLM_PROVIDER == "anthropic":
        async with _anthropic_client().messages.stream(
            model=settings.LLM_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as s:
            async for text in s.text_stream:
                yield text
        return
    resp = await _openai_client().chat.completions.create(
        model=settings.LLM_MODEL,
        stream=True,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        **_openai_extra(max_tokens),
    )
    async for chunk in resp:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


def parse_json(raw: str) -> dict[str, Any]:
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        return {}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------
def format_memories(memories: list[dict[str, Any]]) -> str:
    if not memories:
        return "- (none)"
    lines = []
    for m in memories:
        when = (m.get("occurred_at") or m.get("mentioned_at") or "")[:10]
        lines.append(f"- [{m.get('type')}{' · ' + when if when else ''}] {m['text']}")
    return "\n".join(lines)


def history_block(memories: list[dict[str, Any]], summary: str, memory_ok: bool) -> str:
    if not memory_ok:
        return "MEMORY OFFLINE: you have no history for this customer. Do not pretend otherwise."
    return (
        f"HINDSIGHT REFLECTION:\n{summary or 'No prior history — new customer.'}\n\n"
        f"RECALLED MEMORIES:\n{format_memories(memories)}"
    )


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------
async def triage(message: str, memories: list[dict], summary: str, memory_ok: bool) -> dict[str, Any]:
    raw = await complete(
        TRIAGE_SYSTEM_PROMPT,
        f"{history_block(memories, summary, memory_ok)}\n\nNEW MESSAGE:\n{message}",
        model=settings.LLM_FAST_MODEL,
        max_tokens=2048,
        json_mode=True,
    )
    t = parse_json(raw)
    t.setdefault("issue_category", "other")
    t.setdefault("sentiment", "neutral")
    t.setdefault("urgency", "medium")
    t.setdefault("is_repeat_issue", False)
    t.setdefault("already_tried", [])
    t.setdefault("open_promises", [])
    t.setdefault("known_details", [])
    t.setdefault("churn_risk", "low")
    try:
        prior = int(t.get("prior_contacts_on_issue") or 0)
    except (TypeError, ValueError):
        prior = 0
    t["prior_contacts_on_issue"] = prior
    t["contact_number"] = prior + 1
    t["escalate"] = (
        t["contact_number"] >= settings.ESCALATION_THRESHOLD
        or (t["sentiment"] == "angry" and t["urgency"] == "high")
        or t["churn_risk"] == "high"
    )
    return t


def reply_prompt(message: str, memories: list[dict], summary: str, memory_ok: bool, t: dict, ticket_id: str) -> str:
    guidance = [
        f"Issue category: {t['issue_category']} · ticket {ticket_id}",
        f"This is contact #{t['contact_number']} about this issue.",
        f"Customer sentiment: {t['sentiment']} · urgency: {t['urgency']} · churn risk: {t['churn_risk']}",
    ]
    if t["already_tried"]:
        guidance.append("ALREADY TRIED — do not suggest again: " + "; ".join(t["already_tried"]))
    if t["open_promises"]:
        guidance.append("OPEN PROMISES — address these: " + "; ".join(t["open_promises"]))
    if t["known_details"]:
        guidance.append("KNOWN DETAILS — never ask for these: " + "; ".join(t["known_details"]))
    guidance.append("DECISION: ESCALATE to senior specialist." if t["escalate"] else "DECISION: resolve directly.")
    return (
        f"{history_block(memories, summary, memory_ok)}\n\n"
        f"TRIAGE:\n" + "\n".join(f"- {g}" for g in guidance) + f"\n\nNEW CUSTOMER MESSAGE:\n{message}"
    )


async def extract_facts(message: str, reply: str, t: dict, ticket_id: str) -> dict[str, Any]:
    raw = await complete(
        FACTS_SYSTEM_PROMPT,
        f"CUSTOMER: {message}\nAGENT: {reply}",
        model=settings.LLM_FAST_MODEL,
        max_tokens=1536,
        json_mode=True,
    )
    facts = parse_json(raw)
    facts.update(
        {
            "ticket_id": ticket_id,
            "issue_category": facts.get("issue_category") or t["issue_category"],
            "status": "escalated" if t["escalate"] else (facts.get("status") or "open"),
            "sentiment": t["sentiment"],
            "contact_number": t["contact_number"],
        }
    )
    return facts


async def amnesia_reply(message: str) -> str:
    """What a typical memory-less bot would say — used for the side-by-side demo."""
    return await complete(AMNESIA_SYSTEM_PROMPT, message, max_tokens=1536)
