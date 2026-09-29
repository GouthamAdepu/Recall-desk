import { Brain, Network, Columns2, FileText, Repeat, ShieldAlert, Database, MessageSquare } from "lucide-react";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1">
      <Icon className="h-3.5 w-3.5 text-indigo-300" />
      <span className="font-mono text-sm font-semibold text-white tabular-nums">{value ?? 0}</span>
      <span className="text-[11px] text-slate-400">{label}</span>
    </div>
  );
}

function Health({ health }) {
  const ok = health?.hindsight === "reachable";
  const known = !!health;
  return (
    <div
      className={`chip ${
        !known ? "border-slate-600 text-slate-400" : ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
      title={health ? `LLM: ${health.llm_provider} · ${health.llm_model}` : ""}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400 animate-glow" : "bg-amber-400"}`} />
      Hindsight {known ? (ok ? "connected" : "unreachable") : "…"}
    </div>
  );
}

export default function Header({ health, stats, onCompare, onBriefing, onExplore, disabled }) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-slate-950/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-fuchsia-400 shadow-lg shadow-indigo-500/30">
          <Brain className="text-white" size={18} />
        </div>
        <div className="leading-tight">
          <h1 className="text-base font-bold tracking-tight text-white">RecallDesk</h1>
          <p className="text-[11px] text-slate-400">Support that never forgets · memory by Hindsight</p>
        </div>
      </div>
      <Health health={health} />

      <div className="hidden items-center gap-1.5 xl:flex">
        <Stat icon={MessageSquare} label="conversations" value={stats?.conversations} />
        <Stat icon={Database} label="recalled" value={stats?.memories_recalled} />
        <Stat icon={Repeat} label="repeats caught" value={stats?.repeat_issues_recognized} />
        <Stat icon={ShieldAlert} label="escalations" value={stats?.escalations} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="btn-ghost" onClick={onExplore} disabled={disabled} title="Browse raw memories, documents and links">
          <Network className="h-4 w-4" /> Memory explorer
        </button>
        <button className="btn-ghost" onClick={onBriefing} disabled={disabled} title="Hindsight Reflect → tier-2 handoff">
          <FileText className="h-4 w-4" /> Handoff brief
        </button>
        <button className="btn-primary" onClick={onCompare} disabled={disabled} title="Same message, with vs without memory">
          <Columns2 className="h-4 w-4" /> Memory vs amnesia
        </button>
      </div>
    </header>
  );
}
