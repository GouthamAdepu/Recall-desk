import { useEffect, useRef, useState } from "react";
import { Send, ShieldAlert, Brain, WifiOff, Timer, Headset, User } from "lucide-react";

const QUICK = {
  "C-1001": ["My internet is dropping again, this is getting ridiculous.", "Is the technician still coming?"],
  "C-1002": ["Hey, did my refund ever go through?", "My new bill still shows $129!"],
  "C-1003": ["Speeds feel slow today on my video calls.", "Can I upgrade my plan?"],
  "C-1004": ["Hi, I just moved in and my Wi-Fi light is red.", "It's a TP-Link router, and I'm on Fiber 300."],
};

function Bubble({ m }) {
  const isCustomer = m.role === "customer";
  return (
    <div className={`flex animate-fade-up gap-2.5 ${isCustomer ? "flex-row-reverse" : ""}`}>
      <div
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
          isCustomer ? "bg-slate-700 text-slate-200" : "bg-gradient-to-br from-indigo-400 to-violet-500 text-white"
        }`}
      >
        {isCustomer ? <User className="h-3.5 w-3.5" /> : <Headset className="h-3.5 w-3.5" />}
      </div>
      <div className={`max-w-[78%] ${isCustomer ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isCustomer && m.triage?.is_repeat_issue && (
          <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-200">
            <Brain className="h-3 w-3" /> Recognized contact #{m.triage.contact_number} about {m.triage.issue_category}
          </span>
        )}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
            isCustomer
              ? "rounded-tr-sm bg-indigo-600 text-white"
              : m.error
              ? "rounded-tl-sm border border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "rounded-tl-sm border border-white/5 bg-slate-800/70 text-slate-100"
          } ${m.streaming ? "caret" : ""}`}
        >
          {m.text || (m.streaming ? <span className="text-slate-400">Checking what we know about this customer…</span> : "")}
        </div>
        {!isCustomer && !m.streaming && !m.error && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-500">
            {m.escalated && (
              <span className="chip border-rose-400/30 bg-rose-500/10 text-rose-300">
                <ShieldAlert className="h-3 w-3" /> Escalated to tier 2
              </span>
            )}
            {m.memoryUsed === false && (
              <span className="chip border-amber-400/30 bg-amber-500/10 text-amber-300">
                <WifiOff className="h-3 w-3" /> replied without memory
              </span>
            )}
            {m.elapsed && (
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" /> {(m.elapsed / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel({ customer, messages, busy, memoryAvailable, onSend }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Block bodies: effects must return nothing (scrollIntoView can return a Promise).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [customer, busy]);

  const submit = (value) => {
    const v = (value ?? text).trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  };

  const quick = (customer && QUICK[customer.id]) || (customer?.try ? [customer.try] : []);

  return (
    <div className="panel flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
        <div className="text-sm">
          <span className="text-slate-400">Live chat with </span>
          <span className="font-semibold text-white">{customer?.name || "…"}</span>
          {customer && <span className="ml-2 font-mono text-xs text-slate-500">{customer.id}</span>}
        </div>
        {customer?.tier && <span className="chip border-white/10 text-slate-300">{customer.tier} · {customer.plan}</span>}
      </div>

      {!memoryAvailable && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          <WifiOff className="h-3.5 w-3.5" /> Memory unavailable — Hindsight can't be reached. The assistant still replies, but without customer history.
        </div>
      )}

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/10">
              <Brain className="h-6 w-6 text-indigo-300" />
            </div>
            <h3 className="font-semibold text-white">Type as {customer?.name?.split(" ")[0] || "the customer"}</h3>
            <p className="mt-1 text-sm text-slate-400">
              Before every reply, RecallDesk recalls this customer's history from Hindsight, reflects on it,
              and writes the new exchange back. Watch the pipeline and the memory panel update live.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} m={m} />
        ))}
        <div ref={endRef} />
      </div>

      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {quick.map((q) => (
            <button
              key={q}
              disabled={busy}
              onClick={() => submit(q)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300 transition hover:border-indigo-400/40 hover:text-white disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-white/5 p-3"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          disabled={busy || !customer}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={busy ? "Recalling & replying…" : "Write a message as the customer…  (Enter to send)"}
          className="max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400/60 focus:outline-none"
        />
        <button className="btn-primary h-10" disabled={busy || !text.trim()}>
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </div>
  );
}
