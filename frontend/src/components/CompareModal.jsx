import { useState } from "react";
import { Columns2, Brain, BrainCircuit, Loader2, Play } from "lucide-react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";

function Column({ title, subtitle, icon: Icon, tone, text, loading }) {
  return (
    <div className={`flex flex-col rounded-2xl border p-4 ${tone}`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] opacity-70">{subtitle}</div>
        </div>
      </div>
      <div className="min-h-[160px] whitespace-pre-wrap text-[14px] leading-relaxed text-slate-100">
        {loading ? <Loader2 className="h-5 w-5 animate-spin opacity-60" /> : text || <span className="text-slate-500">—</span>}
      </div>
    </div>
  );
}

export default function CompareModal({ customer, initialMessage, onClose }) {
  const [message, setMessage] = useState(initialMessage);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    try {
      setResult(await api.compare(customer.id, message.trim()));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      wide
      icon={Columns2}
      title="Memory vs amnesia"
      subtitle={`Same message from ${customer.name}, answered with and without Hindsight. Read-only: nothing is retained.`}
      onClose={onClose}
    >
      <div className="mb-4 flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none"
          placeholder="Customer message…"
        />
        <button className="btn-primary" onClick={run} disabled={loading || !message.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Compare
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-amber-300">⚠️ {error}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <Column
          title="Typical support bot"
          subtitle="No memory, starts from zero"
          icon={BrainCircuit}
          tone="border-slate-600/40 bg-slate-800/40 text-slate-300"
          text={result?.without_memory}
          loading={loading}
        />
        <Column
          title="RecallDesk + Hindsight"
          subtitle={result ? `${result.memories_used} memories recalled · reflection · triage` : "Recall → Reflect → Reply"}
          icon={Brain}
          tone="border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
          text={result?.with_memory}
          loading={loading}
        />
      </div>

      {result?.triage && (
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-slate-500">Recognized as</div>
            <div className="font-semibold text-white">
              contact #{result.triage.contact_number} · {result.triage.issue_category}
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-slate-500">Failed fixes skipped</div>
            <div className="font-semibold text-white">{result.triage.already_tried?.length || 0}</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-slate-500">Questions not re-asked</div>
            <div className="font-semibold text-white">{result.triage.known_details?.length || 0}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
