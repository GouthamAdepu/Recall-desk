# 🧠 RecallDesk — The Support Assistant That Never Forgets

> *"I can see this is the third time you've contacted us about your connection dropping in the evenings. The router restarts didn't help, and the technician we promised never called. I'm sorry. I'm escalating this to a senior specialist right now."*

When a customer contacts support again about the same problem, each new agent usually starts from zero and the customer has to explain everything again. **RecallDesk** fixes this with an AI support agent that has **long-term memory for every customer**, built entirely on **[Hindsight Cloud](https://hindsight.vectorize.io/)** by Vectorize.

Before each reply, RecallDesk **recalls** what it knows about the customer, **reflects** on their history, **triages** the new message (repeat issue? mood? churn risk?), streams a reply that uses that history, and then **retains** the new exchange so the next reply knows more.

---

## ✨ Features

| | Feature | Why it matters |
|---|---|---|
| 🔴 | **Live memory pipeline** | Every stage (Identify → Recall → Reflect → Triage → Reply → Retain) lights up in real time over Server-Sent Events. Judges can see the memory at work. |
| 🧠 | **"What I remember" inspector** | Recalled Hindsight memories, color-coded by type (Facts / Events / Insights) with entities, tags and dates. Memories used for the current reply are highlighted. |
| ✨ | **Reflect summary** | Hindsight's reasoned summary of the customer's history, refreshed on every message. |
| 🎯 | **Memory-aware triage** | Detects repeat issues, counts prior contacts, lists fixes that already failed, open promises and details not to re-ask for, plus sentiment, urgency and churn risk. |
| 🚨 | **Auto-escalation** | On the 3rd contact about the same issue (configurable), on angry + urgent messages, or on high churn risk. |
| ⚖️ | **Memory vs amnesia mode** | The same message answered side by side by a memory-less bot and by RecallDesk. The clearest demo moment. |
| 🕸️ | **Memory explorer** | Browse the customer's raw Hindsight bank: every **memory** (filter by type, search, paginate), every source **document** next to the facts extracted from it, an interactive **links graph** (entity / temporal / semantic links with weights; hover or click to trace connections), **entities** by mention count, and bank stats. |
| 📋 | **Tier-2 handoff brief** | One click: Hindsight Reflect writes a structured escalation note (timeline, what was already tried, open promises, next action). |
| ⚡ | **Streaming replies** | Token-by-token streaming from **Groq · gpt-oss-120b** (or any OpenAI-compatible model, or Anthropic). |
| 🛡️ | **Graceful degradation** | If Hindsight is down, the agent still answers, clearly flagged as "memory unavailable". |
| 🆔 | **Flexible identification** | Look up a customer by ID, email or phone. Unknown IDs get a new memory bank automatically. |

---

## 🏗️ Architecture

```
┌───────────────────────────── React + Vite + Tailwind ─────────────────────────────┐
│  Customer list  │  Pipeline tracker + streaming chat  │  Memory inspector          │
│  (ID/email/     │  Identify▸Recall▸Reflect▸Triage▸    │  Reflect summary · recalled │
│   phone lookup) │  Reply▸Retain  (lights up live)     │  memories · triage · tags   │
└────────────────────────────────────┬──────────────────────────────────────────────┘
                                     │  POST /chat/stream  (Server-Sent Events)
┌────────────────────────────────────▼───────────── FastAPI ────────────────────────┐
│ main.py  run_pipeline()                                                           │
│   1 identify  ── customers.resolve() ─▶ bank "customer-<id>"                      │
│   2 RECALL  ─┐                                  ┌──────────────────────────────┐   │
│   3 REFLECT ─┴─ memory.py (asyncio.gather) ───▶ │        HINDSIGHT CLOUD        │   │
│   4 triage  ── assistant.triage()   (LLM, JSON) │  one bank per customer        │   │
│   5 reply   ── assistant.stream()   (LLM, SSE)  │  mission + disposition        │   │
│   6 RETAIN  ── assistant.extract_facts() ─────▶ │  tags: issue/ticket/status/…  │   │
│                memory.remember()                │  types: world/experience/obs  │   │
│                                                 └──────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Hindsight is the only memory.** There is no database, vector store or chat log. The only process-local state is a set of anonymous demo counters (`/stats`).

---

## 🧬 How Hindsight is used

All Hindsight code is in [`backend/memory.py`](backend/memory.py):

| Function | Hindsight call | What it does |
|---|---|---|
| `ensure_bank()` | `acreate_bank(bank_id, name, mission, disposition)` | One bank per customer, created on first contact. The **mission** tells Hindsight what to track (devices, failed fixes, promises, mood, issue status). The **disposition** (`empathy: 5`) shapes how Reflect reasons. |
| `recall()` | `arecall(bank_id, query, types, budget, tags, tags_match)` | Runs before every reply, using the customer's new message as the query. Can be filtered by memory type or by `issue:<category>` tag. |
| `summarize()` | `areflect(bank_id, query, budget, context)` | Runs before every reply. Produces a reasoned briefing: contact count, failed fixes, broken promises, open vs resolved. |
| `handoff_briefing()` | `areflect(..., budget="mid")` | Structured tier-2 escalation note. |
| `remember()` | `aretain(bank_id, content, context, timestamp, document_id, metadata, tags)` | Runs after every reply. Stores the exchange plus extracted facts. Each exchange becomes its own Hindsight document (`<ticket>-<timestamp>`). Tags: `customer:` `issue:` `ticket:` `channel:` `status:`. |

**Memory explorer (raw bank access)** uses Hindsight's documented REST API (`Authorization: Bearer`), in the same file:

| Function | Endpoint | Shows |
|---|---|---|
| `list_memories()` | `GET /v1/default/banks/{bank}/memories/list` | Every memory unit: type, entities, tags, dates, source document |
| `list_documents()` / `get_document()` | `GET …/documents`, `GET …/documents/{id}` + `memories/list?document_id=` | Each retained exchange next to the facts Hindsight extracted from it |
| `graph()` | `GET …/graph` | Memory nodes + links (`entity`, `temporal`, `semantic`, …) with weights |
| `list_entities()` | `GET …/entities` | People, devices, plans and tickets Hindsight identified |
| `bank_stats()` | `GET …/stats` | Counts of memories, documents, links and entities |

Recall and Reflect run **in parallel** (`asyncio.gather`) to keep latency low.

---

## 🚀 Setup

**Prerequisites:** Python 3.10+, Node 18+, a [Hindsight Cloud](https://hindsight.vectorize.io/) API key, and an Anthropic or OpenAI-compatible API key.

```bash
cp .env.example .env             # fill in keys
```

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py                   # load demo history into Hindsight (wait ~30s after)
uvicorn main:app --reload --port 8000
```

**Frontend** (new terminal)
```bash
cd frontend
npm install
npm run dev                      # → http://localhost:5173
```

### Environment variables

| Var | Default | Description |
|---|---|---|
| `HINDSIGHT_API_KEY` | – | Hindsight Cloud API key |
| `HINDSIGHT_API_URL` | `https://api.hindsight.vectorize.io` | Hindsight endpoint |
| `HINDSIGHT_RECALL_BUDGET` / `_REFLECT_BUDGET` | `mid` / `low` | How much effort Hindsight spends searching and reasoning |
| `LLM_PROVIDER` | `openai` | `openai` (any OpenAI-compatible API: Groq by default) or `anthropic` |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | – | Groq API key |
| `LLM_MODEL` | `openai/gpt-oss-120b` | Model used for the reply |
| `LLM_FAST_MODEL` | = `LLM_MODEL` | Model for triage and fact extraction (e.g. `openai/gpt-oss-20b`) |
| `LLM_REASONING_EFFORT` | `low` | Reasoning effort for gpt-oss (`low` / `medium` / `high`). Leave empty for non-reasoning models |
| `LLM_JSON_MODE` | `true` | Use `response_format: json_object` for triage and fact extraction |
| `ESCALATION_THRESHOLD` | `3` | Contact count on the same issue that triggers escalation |

---

## 🔌 API

| Method | Path | Description |
|---|---|---|
| `POST` | `/chat/stream` | `{customer_id, message}` → SSE: `stage`, `memories`, `summary`, `triage`, `token`, `done`, `error` |
| `POST` | `/chat` | Same pipeline without streaming → `{reply, recalled_memories, summary, triage, facts, tags, …}` |
| `POST` | `/chat/compare` | Answers with vs without memory (read-only) |
| `GET` | `/customers` · `/customers/{id}` | Demo directory; lookup by ID, email or phone |
| `GET` | `/customers/{id}/summary` | Hindsight Reflect summary |
| `GET` | `/customers/{id}/memories?type=&issue=` | Hindsight Recall, filterable by type or issue tag |
| `GET` | `/customers/{id}/bank/memories?type=&q=&document_id=&limit=&offset=` | Raw memory units |
| `GET` | `/customers/{id}/bank/documents` · `/bank/documents/{doc_id}` | Source documents + extracted facts |
| `GET` | `/customers/{id}/bank/graph` | Memory graph: nodes + typed, weighted links |
| `GET` | `/customers/{id}/bank/entities` · `/bank/stats` | Entities · bank statistics |
| `GET` | `/customers/{id}/briefing` | Tier-2 handoff (Reflect) |
| `GET` | `/health` · `/stats` | Hindsight connectivity · demo counters |

---

## 🎬 Demo script (≈3 minutes)

1. **The hook (C-1001 · Maya).** The inspector already shows two past calls about evening Wi-Fi drops, a failed router restart and a technician visit that was promised. Click the chip *"My internet is dropping again…"*.
   - Recall and Reflect light up, then Triage shows **contact #3 → ESCALATE**.
   - The streamed reply mentions both earlier calls, **doesn't** suggest restarting the router, owns the missed technician call and escalates with the ticket ID.
   - The **Reasoning** tab lists *Already tried*, *Open promises* and *Known, won't re-ask*, then **Retained to Hindsight** with its tags.
2. **The contrast.** Click **Memory vs amnesia** and run it. The left column asks for the router model and suggests restarting it. The right column already knows everything.
3. **The handoff.** Click **Handoff brief**. Hindsight Reflect writes a tier-2 note, ready to paste into the ticket.
4. **Under the hood.** Click **Memory explorer**. *Documents* shows ticket `T-48213`'s calls next to the facts Hindsight extracted from them. *Links graph* shows how "Netgear RAX50", the evening drops and the broken promise are connected.
5. **Billing (C-1002 · James).** *"Did my refund ever go through?"* It knows about the $50 Premium Sports add-on and the account ending in 4471 without asking.
6. **Memory forming (C-1004 · Liam).** A brand-new customer with an empty memory panel. Send *"Hi, I just moved in and my Wi-Fi light is red."*, then *"It's a TP-Link router, and I'm on Fiber 300."* Refresh the inspector: Hindsight has already extracted his router and plan.
7. **Resilience.** Set `HINDSIGHT_API_URL` to a bad value and restart. The amber *memory unavailable* banner appears and the agent still replies.

---

## 📁 Project structure

```
recalldesk/
├── backend/
│   ├── main.py          # FastAPI routes + streaming pipeline
│   ├── memory.py        # ALL Hindsight logic (ensure_bank / remember / recall / summarize / handoff_briefing)
│   ├── assistant.py     # prompts, triage, streaming reply, fact extraction (Anthropic / OpenAI-compatible)
│   ├── customers.py     # demo customer directory (identity only)
│   ├── config.py        # env loading
│   ├── seed.py          # demo history → Hindsight
│   └── requirements.txt
├── frontend/
│   ├── src/App.jsx, api.js (SSE client), components/…
│   ├── index.html, vite.config.js, tailwind.config.js
│   └── package.json
├── .env.example
└── README.md
```
