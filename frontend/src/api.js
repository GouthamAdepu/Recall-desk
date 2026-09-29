const API = "/api";

async function getJSON(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  health: () => getJSON("/health"),
  stats: () => getJSON("/stats"),
  customers: () => getJSON("/customers"),
  summary: (id) => getJSON(`/customers/${encodeURIComponent(id)}/summary`),
  memories: (id, { type, issue } = {}) => {
    const qs = new URLSearchParams();
    if (type) qs.set("type", type);
    if (issue) qs.set("issue", issue);
    return getJSON(`/customers/${encodeURIComponent(id)}/memories?${qs}`);
  },
  bank: {
    stats: (id) => getJSON(`/customers/${encodeURIComponent(id)}/bank/stats`),
    memories: (id, params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
      return getJSON(`/customers/${encodeURIComponent(id)}/bank/memories?${qs}`);
    },
    documents: (id) => getJSON(`/customers/${encodeURIComponent(id)}/bank/documents`),
    document: (id, docId) =>
      getJSON(`/customers/${encodeURIComponent(id)}/bank/documents/${encodeURIComponent(docId)}`),
    graph: (id, type) => getJSON(`/customers/${encodeURIComponent(id)}/bank/graph${type ? `?type=${type}` : ""}`),
    entities: (id) => getJSON(`/customers/${encodeURIComponent(id)}/bank/entities`),
  },
  briefing: (id) => getJSON(`/customers/${encodeURIComponent(id)}/briefing`),
  compare: async (customer_id, message) => {
    const res = await fetch(`${API}/chat/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id, message }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
};

/**
 * POST /chat/stream and dispatch Server-Sent Events to `onEvent(event, data)`.
 * (EventSource can't POST, so we parse the stream manually.)
 */
export async function streamChat({ customer_id, message, channel = "chat" }, onEvent, signal) {
  const res = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id, message, channel }),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = (await res.json().catch(() => ({}))).detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      try {
        onEvent(event, data ? JSON.parse(data) : null);
      } catch (e) {
        console.error("bad SSE payload", e, data);
      }
    }
  }
}
