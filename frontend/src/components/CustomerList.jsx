import { useState } from "react";
import { Search, Crown, Sparkles } from "lucide-react";

const tierStyle = {
  Platinum: "from-slate-200 to-slate-400 text-slate-900",
  Gold: "from-amber-300 to-amber-500 text-amber-950",
  Silver: "from-slate-400 to-slate-500 text-slate-950",
  New: "from-emerald-300 to-teal-400 text-emerald-950",
};

export default function CustomerList({ customers, selected, onSelect, onCustom, disabled }) {
  const [q, setQ] = useState("");

  return (
    <aside className="panel flex min-h-0 flex-col">
      <div className="border-b border-white/5 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Identify customer</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCustom(q);
            setQ("");
          }}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 focus-within:border-indigo-400/60"
        >
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={disabled}
            placeholder="ID, email or phone…"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </form>
      </div>

      <div className="scroll-thin flex-1 space-y-1.5 overflow-y-auto p-2">
        <p className="px-1.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Demo customers</p>
        {customers.map((c) => {
          const active = selected?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              disabled={disabled && !active}
              className={`group w-full rounded-xl border p-2.5 text-left transition ${
                active
                  ? "border-indigo-400/40 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(129,140,248,0.15)]"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
              } disabled:opacity-40`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xs font-bold ${tierStyle[c.tier] || tierStyle.New}`}>
                  {c.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-white">{c.name}</span>
                    {c.tier === "New" ? (
                      <Sparkles className="h-3 w-3 text-emerald-300" />
                    ) : (
                      <Crown className="h-3 w-3 text-amber-300/80" />
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {c.id} · {c.plan}
                  </div>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-[11.5px] leading-snug text-slate-400">{c.scenario}</p>
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/5 p-3 text-[11px] leading-relaxed text-slate-500">
        Each customer has their own <span className="text-indigo-300">Hindsight memory bank</span>
        <span className="font-mono"> customer-&lt;id&gt;</span>, created automatically on first contact.
      </div>
    </aside>
  );
}
