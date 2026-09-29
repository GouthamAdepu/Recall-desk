import { useState } from "react";
import {
  Sparkles, Database, Gauge, RefreshCw, Globe, History, Lightbulb, Tag, Save, ShieldAlert, Ban, Handshake, Lock,
} from "lucide-react";

const TYPE_META = {
  world: { label: "Fact", icon: Globe, cls: "border-sky-400/30 bg-sky-500/10 text-sky-300", bar: "bg-sky-400" },
  experience: { label: "Event", icon: History, cls: "border-violet-400/30 bg-violet-500/10 text-violet-300", bar: "bg-violet-400" },
  observation: { label: "Insight", icon: Lightbulb, cls: "border-amber-400/30 bg-amber-500/10 text-amber-300", bar: "bg-amber-400" },
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "world", label: "Facts" },
  { key: "experience", label: "Events" },
  { key: "observation", label: "Insights" },
];

function Skeleton({ lines = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="relative h-3 overflow-hidden rounded bg-white/5" style={{ width: `${90 - i * 12}%` }}>
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      ))}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days}d ago`;
  return d.toLocaleDateString();
}

function MemoryCard({ m, fresh }) {
  const meta = TYPE_META[m.type] || TYPE_META.world;
  const Icon = meta.icon;
  const when = fmtDate(m.occurred_at || m.mentioned_at);
  return (
    <li className={`relative animate-fade-up overflow-hidden rounded-xl border bg-slate-950/50 p-2.5 pl-3.5 ${fresh ? "border-indigo-400/40" : "border-white/5"}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${meta.bar}`} />
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`chip ${meta.cls}`}>
          <Icon className="h-3 w-3" /> {meta.label}
        </span>
        {when && <span className="text-[10.5px] text-slate-500">{when}</span>}
        {fresh && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-indigo-300">used now</span>}
      </div>
      <p className="text-[13px] leading-snug text-slate-200">{m.text}</p>
      {(m.entities?.length > 0 || m.tags?.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {m.entities?.slice(0, 4).map((e) => (
            <span key={e} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{e}</span>
          ))}
          {m.tags?.filter((t) => !t.startsWith("customer:")).slice(0, 3).map((t) => (
            <span key={t} className="rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">#{t}</span>
          ))}
        </div>
      )}
    </li>
  );
}

function Meter({ label, value, levels, colors }) {
  const idx = Math.max(0, levels.indexOf(value));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold capitalize text-slate-200">{value}</span>
      </div>
      <div className="flex gap-1">
        {levels.map((l, i) => (
          <div key={l} className={`h-1.5 flex-1 rounded-full ${i <= idx ? colors[idx] : "bg-white/5"}`} />
        ))}
      </div>
    </div>
  );
}

function ListBlock({ icon: Icon, title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it} className="rounded-lg bg-white/[0.03] px-2 py-1 text-[12.5px] text-slate-300">{it}</li>
        ))}
      </ul>
    </div>
  );
}

function TriageView({ triage, retained }) {
  if (!triage)
    return <p className="text-sm text-slate-500">Send a message to see how RecallDesk reasons about it using memory.</p>;
  return (
    <div className="space-y-4">
      {triage.escalate && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <div>
            <div className="text-sm font-semibold text-rose-200">Auto-escalated to tier 2</div>
            <div className="text-xs text-rose-200/70">
              Contact #{triage.contact_number} about {triage.issue_category}
              {triage.churn_risk === "high" ? " · high churn risk" : ""}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Contact #", triage.contact_number],
          ["Issue", triage.issue_category],
          ["Ticket", triage.ticket_id],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/[0.03] p-2">
            <div className="truncate font-mono text-sm font-semibold capitalize text-white">{v}</div>
            <div className="text-[10px] text-slate-500">{k}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2.5">
        <Meter label="Sentiment" value={triage.sentiment} levels={["positive", "neutral", "frustrated", "angry"]}
          colors={["bg-emerald-400", "bg-sky-400", "bg-amber-400", "bg-rose-500"]} />
        <Meter label="Urgency" value={triage.urgency} levels={["low", "medium", "high"]}
          colors={["bg-emerald-400", "bg-amber-400", "bg-rose-500"]} />
        <Meter label="Churn risk" value={triage.churn_risk} levels={["low", "medium", "high"]}
          colors={["bg-emerald-400", "bg-amber-400", "bg-rose-500"]} />
      </div>
      <ListBlock icon={Ban} title="Already tried — won't repeat" items={triage.already_tried} tone="text-rose-300" />
      <ListBlock icon={Handshake} title="Open promises" items={triage.open_promises} tone="text-amber-300" />
      <ListBlock icon={Lock} title="Known — won't re-ask" items={triage.known_details} tone="text-sky-300" />
      {triage.reasoning && <p className="border-l-2 border-white/10 pl-2 text-xs italic text-slate-400">{triage.reasoning}</p>}

      {retained && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            <Save className="h-3.5 w-3.5" /> Retained to Hindsight
          </div>
          {retained.facts?.notes && <p className="mb-2 text-[12.5px] text-slate-300">{retained.facts.notes}</p>}
          <div className="flex flex-wrap gap-1">
            {retained.tags?.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                <Tag className="h-2.5 w-2.5" /> {t}
              </span>
            ))}
            {!retained.tags?.length && <span className="text-xs text-amber-300">Not retained — memory offline</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inspector({
  customer, summary, memories, freshIds, triage, retained, loading, memoryAvailable, onRefresh, onFilter,
}) {
  const [tab, setTab] = useState("memory");
  const [filter, setFilter] = useState("");

  const counts = memories.reduce((acc, m) => ({ ...acc, [m.type]: (acc[m.type] || 0) + 1 }), {});

  const tabs = [
    { key: "memory", label: "What I remember", icon: Database, badge: memories.length },
    { key: "triage", label: "Reasoning", icon: Gauge, badge: triage?.escalate ? "!" : null },
  ];

  return (
    <aside className="panel flex min-h-0 flex-col">
      {/* Reflect summary — always visible */}
      <div className="border-b border-white/5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-fuchsia-300" /> Customer summary
            <span className="rounded bg-violet-500/20 px-1.5 text-[10px] font-bold text-violet-300">REFLECT</span>
          </h2>
          <button onClick={onRefresh} className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white" title="Reload from Hindsight">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {loading && !summary ? (
          <Skeleton lines={4} />
        ) : (
          <p className="rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-3 text-[13px] leading-relaxed text-slate-200">
            {memoryAvailable ? summary || "No prior history — new customer." : "Memory unavailable."}
          </p>
        )}
      </div>

      <div className="flex gap-1 border-b border-white/5 px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 text-xs font-medium transition ${
              tab === t.key ? "border-indigo-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
            {t.badge ? (
              <span className={`rounded-full px-1.5 text-[10px] ${t.badge === "!" ? "bg-rose-500 text-white" : "bg-white/10 text-slate-300"}`}>
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "memory" ? (
          <>
            <div className="mb-3 flex items-center gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setFilter(f.key);
                    onFilter({ type: f.key || undefined });
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
                    filter === f.key ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:bg-white/5"
                  }`}
                >
                  {f.label}
                  {f.key && counts[f.key] ? ` ${counts[f.key]}` : ""}
                </button>
              ))}
            </div>
            {loading ? (
              <Skeleton lines={6} />
            ) : memories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                {memoryAvailable
                  ? `No memories for ${customer?.name || "this customer"} yet. Send a message and watch Hindsight start remembering.`
                  : "Hindsight is unreachable."}
              </div>
            ) : (
              <ul className="space-y-2">
                {memories.map((m, i) => (
                  <MemoryCard key={m.id || i} m={m} fresh={freshIds.has(m.id)} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <TriageView triage={triage} retained={retained} />
        )}
      </div>
    </aside>
  );
}
