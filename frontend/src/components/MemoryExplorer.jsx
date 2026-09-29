import { useEffect, useMemo, useState } from "react";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
} from "d3-force";
import {
  Network, Database, FileText, Share2, Users, Search, Loader2, ChevronLeft, ChevronRight, ArrowLeft,
} from "lucide-react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";

const TYPE_COLOR = { world: "#38bdf8", experience: "#a78bfa", observation: "#fbbf24", opinion: "#f472b6" };
const TYPE_LABEL = { world: "Fact", experience: "Event", observation: "Insight", opinion: "Opinion" };
const LINK_COLOR = { entity: "#34d399", temporal: "#60a5fa", semantic: "#c084fc", causal: "#fb7185" };

function TypeChip({ type }) {
  const c = TYPE_COLOR[type] || "#94a3b8";
  return (
    <span className="chip" style={{ borderColor: `${c}55`, background: `${c}18`, color: c }}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}

function Empty({ children }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">{children}</div>;
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Reading the Hindsight bank…
    </div>
  );
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

/* ───────────────────────── Memories ───────────────────────── */
function MemoriesTab({ customerId, onOpenDoc }) {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const limit = 25;

  useEffect(() => {
    setData(null);
    api.bank.memories(customerId, { type, q: query, limit, offset: page * limit }).then(setData).catch(() => setData({ items: [], total: 0 }));
  }, [customerId, type, query, page]);

  const pages = data ? Math.max(1, Math.ceil((data.total || 0) / limit)) : 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {["", "world", "experience", "observation"].map((t) => (
          <button key={t} onClick={() => { setType(t); setPage(0); }}
            className={`rounded-full px-2.5 py-1 text-xs ${type === t ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:bg-white/5"}`}>
            {t ? TYPE_LABEL[t] + "s" : "All"}
          </button>
        ))}
        <form className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1"
          onSubmit={(e) => { e.preventDefault(); setQuery(q); setPage(0); }}>
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text…"
            className="w-44 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
        </form>
      </div>

      {!data ? <Spinner /> : data.items.length === 0 ? (
        <Empty>No memories match. {data.memory_available === false && "Hindsight is unreachable."}</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-slate-500">
              <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Memory</th><th className="px-3 py-2">Entities</th><th className="px-3 py-2">When</th><th className="px-3 py-2">Source</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.items.map((m) => (
                <tr key={m.id} className="align-top hover:bg-white/[0.02]">
                  <td className="px-3 py-2"><TypeChip type={m.type} /></td>
                  <td className="px-3 py-2 text-slate-200">{m.text}
                    {m.tags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.tags.filter((t) => !t.startsWith("customer:")).map((t) => (
                          <span key={t} className="font-mono text-[10px] text-indigo-300">#{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {m.entities.map((e) => <span key={e} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-300">{e}</span>)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-500">{fmt(m.occurred_at || m.mentioned_at)}</td>
                  <td className="px-3 py-2">
                    {m.document_id && (
                      <button onClick={() => onOpenDoc(m.document_id)} className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-300 hover:underline">
                        <FileText className="h-3 w-3" /> {m.document_id}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > limit && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-400">
          <button className="btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></button>
          Page {page + 1} / {pages} · {data.total} memories
          <button className="btn-ghost px-2 py-1" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Documents ───────────────────────── */
function DocumentsTab({ customerId, openDocId, setOpenDocId }) {
  const [docs, setDocs] = useState(null);
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    api.bank.documents(customerId).then((r) => setDocs(r.documents)).catch(() => setDocs([]));
  }, [customerId]);

  useEffect(() => {
    if (!openDocId) {
      setDoc(null);
      return;
    }
    setDoc("loading");
    api.bank.document(customerId, openDocId).then((r) => setDoc(r.document)).catch(() => setDoc(null));
  }, [customerId, openDocId]);

  if (openDocId) {
    return (
      <div>
        <button onClick={() => setOpenDocId(null)} className="btn-ghost mb-3"><ArrowLeft className="h-4 w-4" /> All documents</button>
        {doc === "loading" ? <Spinner /> : !doc ? <Empty>Document not found.</Empty> : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-sky-300">Source document · {doc.id}</div>
              <div className="mb-2 text-[11px] text-slate-500">{fmt(doc.created_at)}</div>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-200">{doc.original_text || "(original text not stored)"}</pre>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-violet-300">
                Memories Hindsight extracted ({doc.memories.length})
              </div>
              <ul className="space-y-2">
                {doc.memories.map((m) => (
                  <li key={m.id} className="rounded-lg bg-white/[0.03] p-2 text-[13px] text-slate-200">
                    <TypeChip type={m.type} /> <span className="ml-1">{m.text}</span>
                  </li>
                ))}
                {doc.memories.length === 0 && <li className="text-sm text-slate-500">Still processing, or no facts extracted yet.</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!docs) return <Spinner />;
  if (!docs.length) return <Empty>No documents retained yet.</Empty>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {docs.map((d) => (
        <button key={d.id} onClick={() => setOpenDocId(d.id)}
          className="rounded-xl border border-white/5 bg-slate-950/50 p-3 text-left transition hover:border-sky-400/40">
          <div className="mb-1 flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-300" />
            <span className="truncate font-mono text-xs text-sky-200">{d.id}</span>
            <span className="ml-auto text-[11px] text-slate-500">{fmt(d.created_at)}</span>
          </div>
          <p className="line-clamp-3 text-[12.5px] text-slate-400">{d.preview}</p>
          <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
            {d.memory_count != null && <span>{d.memory_count} memories</span>}
            {d.chunk_count != null && <span>{d.chunk_count} chunks</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Graph (links) ───────────────────────── */
const W = 900, H = 520;

function GraphTab({ customerId }) {
  const [raw, setRaw] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.bank.graph(customerId).then(setRaw).catch(() => setRaw({ nodes: [], edges: [] }));
  }, [customerId]);

  // Lay the graph out once per data load (synchronous d3-force simulation).
  const layout = useMemo(() => {
    if (!raw?.nodes?.length) return null;
    const nodes = raw.nodes.map((n) => ({ ...n }));
    const links = raw.edges.map((e) => ({ ...e }));
    const degree = {};
    links.forEach((l) => { degree[l.source] = (degree[l.source] || 0) + 1; degree[l.target] = (degree[l.target] || 0) + 1; });
    nodes.forEach((n) => { n.r = 5 + Math.min(10, Math.sqrt(degree[n.id] || 0) * 2); });
    const sim = forceSimulation(nodes)
      .force("link", forceLink(links).id((d) => d.id).distance((l) => 70 - l.weight * 30).strength((l) => 0.2 + l.weight * 0.5))
      .force("charge", forceManyBody().strength(-160))
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide().radius((d) => d.r + 4))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    nodes.forEach((n) => { n.x = Math.max(20, Math.min(W - 20, n.x)); n.y = Math.max(20, Math.min(H - 20, n.y)); });
    return { nodes, links, degree };
  }, [raw]);

  if (!raw) return <Spinner />;
  if (!layout) return <Empty>No graph yet. Hindsight builds links as memories accumulate.</Empty>;

  const linkTypes = [...new Set(layout.links.map((l) => l.type))];
  const focus = hover || selected;
  const neighbors = new Set(
    focus ? layout.links.filter((l) => l.source.id === focus.id || l.target.id === focus.id).flatMap((l) => [l.source.id, l.target.id]) : []
  );
  const selLinks = selected ? layout.links.filter((l) => l.source.id === selected.id || l.target.id === selected.id) : [];

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
      <div className="relative overflow-hidden rounded-xl border border-white/5 bg-slate-950/70">
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
          {linkTypes.map((t) => (
            <button key={t} onClick={() => setHidden((h) => { const n = new Set(h); n.has(t) ? n.delete(t) : n.add(t); return n; })}
              className={`chip ${hidden.has(t) ? "border-white/10 text-slate-500 line-through" : ""}`}
              style={hidden.has(t) ? {} : { borderColor: `${LINK_COLOR[t] || "#94a3b8"}66`, color: LINK_COLOR[t] || "#94a3b8" }}>
              <span className="h-1.5 w-3 rounded-full" style={{ background: LINK_COLOR[t] || "#94a3b8" }} /> {t} links
            </button>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[520px] w-full" onClick={() => setSelected(null)}>
          {layout.links.filter((l) => !hidden.has(l.type)).map((l, i) => {
            const active = focus && (l.source.id === focus.id || l.target.id === focus.id);
            return (
              <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
                stroke={LINK_COLOR[l.type] || "#94a3b8"} strokeWidth={active ? 2 : 0.6 + l.weight * 1.4}
                strokeOpacity={focus ? (active ? 0.95 : 0.06) : 0.35} />
            );
          })}
          {layout.nodes.map((n) => {
            const dim = focus && !neighbors.has(n.id) && focus.id !== n.id;
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); setSelected(n); }}>
                <circle r={n.r} fill={TYPE_COLOR[n.type] || "#94a3b8"} fillOpacity={dim ? 0.15 : 0.9}
                  stroke={selected?.id === n.id ? "#fff" : "#0f172a"} strokeWidth={selected?.id === n.id ? 2.5 : 1.5} />
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg border border-white/10 bg-slate-900/95 p-2.5 text-[13px] text-slate-200 shadow-xl">
            <TypeChip type={hover.type} /> <span className="ml-1">{hover.text}</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3 text-xs">
          <div className="mb-2 font-semibold uppercase tracking-wider text-slate-500">Legend</div>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 py-0.5 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[k] }} /> {v}
            </div>
          ))}
          <div className="mt-2 border-t border-white/5 pt-2 text-slate-500">
            {layout.nodes.length} memories · {layout.links.length} links. Bigger node = more connected.
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {selected ? "Selected memory" : "Click a node"}
          </div>
          {selected ? (
            <>
              <p className="mb-2 text-[13px] text-slate-200">{selected.text}</p>
              <div className="mb-1 text-[11px] text-slate-500">{selLinks.length} links</div>
              <ul className="scroll-thin max-h-60 space-y-1.5 overflow-y-auto">
                {selLinks.map((l, i) => {
                  const other = l.source.id === selected.id ? l.target : l.source;
                  return (
                    <li key={i} className="cursor-pointer rounded-lg bg-white/[0.03] p-1.5 text-[12px] text-slate-300 hover:bg-white/[0.06]" onClick={() => setSelected(other)}>
                      <span className="font-semibold" style={{ color: LINK_COLOR[l.type] || "#94a3b8" }}>{l.type}</span>
                      <span className="text-slate-500"> · {l.weight.toFixed(2)}</span>
                      <div className="line-clamp-2">{other.text}</div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-xs text-slate-500">Hover to highlight a memory's links; click to trace them.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Entities ───────────────────────── */
function EntitiesTab({ customerId }) {
  const [ents, setEnts] = useState(null);
  useEffect(() => {
    api.bank.entities(customerId).then((r) => setEnts(r.entities)).catch(() => setEnts([]));
  }, [customerId]);
  if (!ents) return <Spinner />;
  if (!ents.length) return <Empty>No entities extracted yet.</Empty>;
  const max = Math.max(1, ...ents.map((e) => e.mentions || 0));
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ents.map((e) => (
        <div key={e.id || e.name} className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-200">{e.name}</span>
            <span className="font-mono text-xs text-slate-500">{e.mentions}×</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/5">
            <div className="h-1 rounded-full bg-emerald-400/70" style={{ width: `${((e.mentions || 0) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Shell ───────────────────────── */
const TABS = [
  { key: "memories", label: "Memories", icon: Database },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "graph", label: "Links graph", icon: Share2 },
  { key: "entities", label: "Entities", icon: Users },
];

function prettyKey(k) {
  return k.replace(/[._]/g, " ").replace(/\btotal\b/i, "").trim();
}

export default function MemoryExplorer({ customer, onClose }) {
  const [tab, setTab] = useState("memories");
  const [stats, setStats] = useState(null);
  const [openDocId, setOpenDocId] = useState(null);

  useEffect(() => {
    api.bank.stats(customer.id).then(setStats).catch(() => setStats({ stats: {}, memory_available: false }));
  }, [customer.id]);

  const statEntries = Object.entries(stats?.stats || {}).slice(0, 8);

  return (
    <Modal wide icon={Network} title={`Memory explorer: ${customer.name}`}
      subtitle={`Everything Hindsight holds in bank ${stats?.bank_id || "…"}. The raw memories, the documents they came from, and the links between them.`}
      onClose={onClose}>
      {statEntries.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {statEntries.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.03] p-2.5">
              <div className="font-mono text-lg font-semibold text-white">{v}</div>
              <div className="truncate text-[11px] capitalize text-slate-500">{prettyKey(k)}</div>
            </div>
          ))}
        </div>
      )}
      {stats?.memory_available === false && (
        <p className="mb-3 text-sm text-amber-300">⚠️ Hindsight is unreachable, so the bank can't be browsed right now.</p>
      )}

      <div className="mb-4 flex gap-1 border-b border-white/5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm transition ${
              tab === t.key ? "border-indigo-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "memories" && (
        <MemoriesTab customerId={customer.id} onOpenDoc={(id) => { setOpenDocId(id); setTab("documents"); }} />
      )}
      {tab === "documents" && <DocumentsTab customerId={customer.id} openDocId={openDocId} setOpenDocId={setOpenDocId} />}
      {tab === "graph" && <GraphTab customerId={customer.id} />}
      {tab === "entities" && <EntitiesTab customerId={customer.id} />}
    </Modal>
  );
}
