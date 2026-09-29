import { UserCheck, Search, Sparkles, Gauge, PenLine, Save, Check, X, Loader2 } from "lucide-react";

export const STAGES = [
  { key: "identify", label: "Identify", sub: "bank lookup", icon: UserCheck },
  { key: "recall", label: "Recall", sub: "Hindsight", icon: Search, hindsight: true },
  { key: "reflect", label: "Reflect", sub: "Hindsight", icon: Sparkles, hindsight: true },
  { key: "triage", label: "Triage", sub: "repeat · mood", icon: Gauge },
  { key: "generate", label: "Reply", sub: "LLM stream", icon: PenLine },
  { key: "retain", label: "Retain", sub: "Hindsight", icon: Save, hindsight: true },
];

function StatusIcon({ status, Icon }) {
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === "done") return <Check className="h-4 w-4" />;
  if (status === "error") return <X className="h-4 w-4" />;
  return <Icon className="h-4 w-4" />;
}

const tone = {
  idle: "border-white/10 bg-white/[0.02] text-slate-500",
  active: "border-indigo-400/60 bg-indigo-500/15 text-indigo-200 shadow-[0_0_24px_-4px_rgba(129,140,248,0.6)]",
  done: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  error: "border-amber-400/40 bg-amber-500/10 text-amber-300",
};

export default function PipelineTracker({ stages, busy }) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Memory pipeline</span>
        <span className="text-[11px] text-slate-500">{busy ? "running…" : "waiting for a message"}</span>
      </div>
      <ol className="flex items-stretch gap-1 overflow-x-auto scroll-thin">
        {STAGES.map((s, i) => {
          const st = stages[s.key] || { status: "idle" };
          return (
            <li key={s.key} className="flex min-w-[96px] flex-1 items-center gap-1">
              <div className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 transition-all duration-300 ${tone[st.status]}`}>
                <StatusIcon status={st.status} Icon={s.icon} />
                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    {s.label}
                    {s.hindsight && <span className="rounded bg-violet-500/20 px-1 text-[9px] font-bold text-violet-300">HS</span>}
                  </div>
                  <div className="truncate text-[10px] opacity-75">{st.detail || s.sub}</div>
                </div>
              </div>
              {i < STAGES.length - 1 && <div className={`h-px w-2 shrink-0 ${st.status === "done" ? "bg-emerald-400/50" : "bg-white/10"}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
