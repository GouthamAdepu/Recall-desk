import { useCallback, useEffect, useRef, useState } from "react";
import { api, streamChat } from "./api.js";
import Header from "./components/Header.jsx";
import CustomerList from "./components/CustomerList.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import PipelineTracker, { STAGES } from "./components/PipelineTracker.jsx";
import Inspector from "./components/Inspector.jsx";
import CompareModal from "./components/CompareModal.jsx";
import BriefingModal from "./components/BriefingModal.jsx";
import MemoryExplorer from "./components/MemoryExplorer.jsx";

const idleStages = () => Object.fromEntries(STAGES.map((s) => [s.key, { status: "idle" }]));

export default function App() {
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);

  const [threads, setThreads] = useState({}); // customerId -> messages (session only)
  const [stages, setStages] = useState(idleStages);
  const [busy, setBusy] = useState(false);

  const [memories, setMemories] = useState([]);
  const [summary, setSummary] = useState("");
  const [triage, setTriage] = useState(null);
  const [retained, setRetained] = useState(null);
  const [memoryAvailable, setMemoryAvailable] = useState(true);
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [freshIds, setFreshIds] = useState(new Set());

  const [compareOpen, setCompareOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const abortRef = useRef(null);

  const messages = (customer && threads[customer.id]) || [];
  const lastCustomerMsg = [...messages].reverse().find((m) => m.role === "customer")?.text;

  const refreshStats = useCallback(() => api.stats().then(setStats).catch(() => {}), []);

  useEffect(() => {
    api.customers().then((list) => {
      setCustomers(list);
      if (list.length) setCustomer(list[0]);
    });
    api.health().then(setHealth).catch(() => setHealth({ status: "down", hindsight: "unreachable" }));
    refreshStats();
    const t = setInterval(() => api.health().then(setHealth).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, [refreshStats]);

  // Load what Hindsight already knows whenever the customer changes.
  const loadMemory = useCallback(async (c) => {
    if (!c) return;
    setLoadingMemory(true);
    setTriage(null);
    setRetained(null);
    setStages(idleStages());
    try {
      const [s, m] = await Promise.all([api.summary(c.id), api.memories(c.id)]);
      setSummary(s.summary);
      setMemories(m.memories);
      setFreshIds(new Set());
      setMemoryAvailable(s.memory_available && m.memory_available);
    } catch {
      setMemoryAvailable(false);
    } finally {
      setLoadingMemory(false);
    }
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    loadMemory(customer);
  }, [customer, loadMemory]);

  const appendToThread = (id, updater) =>
    setThreads((t) => ({ ...t, [id]: updater(t[id] || []) }));

  const send = async (text) => {
    if (!customer || busy) return;
    const id = customer.id;
    setBusy(true);
    setStages(idleStages());
    setTriage(null);
    setRetained(null);
    appendToThread(id, (m) => [
      ...m,
      { role: "customer", text, at: Date.now() },
      { role: "assistant", text: "", streaming: true, at: Date.now() },
    ]);

    const patchLast = (patch) =>
      appendToThread(id, (m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, ...(typeof patch === "function" ? patch(last) : patch) };
        return copy;
      });

    const controller = new AbortController();
    abortRef.current = controller;
    const prevIds = new Set(memories.map((m) => m.id));

    try {
      await streamChat(
        { customer_id: id, message: text },
        (event, data) => {
          switch (event) {
            case "stage":
              setStages((s) => ({ ...s, [data.stage]: { status: data.status, detail: data.detail } }));
              break;
            case "memories":
              setMemories(data.memories);
              setMemoryAvailable(data.available);
              setFreshIds(new Set(data.memories.filter((m) => !prevIds.has(m.id)).map((m) => m.id)));
              break;
            case "summary":
              setSummary(data.summary);
              break;
            case "memory_error":
              setMemoryAvailable(false);
              break;
            case "triage":
              setTriage(data);
              patchLast({ triage: data });
              break;
            case "token":
              patchLast((last) => ({ text: last.text + data.text }));
              break;
            case "done":
              setRetained({ tags: data.tags, facts: data.facts });
              setMemoryAvailable(data.memory_available);
              patchLast({
                text: data.reply,
                streaming: false,
                elapsed: data.elapsed_ms,
                escalated: data.triage?.escalate,
                memoryUsed: data.memory_available,
              });
              break;
            case "error":
              patchLast({ text: `⚠️ ${data.message}`, streaming: false, error: true });
              break;
            default:
          }
        },
        controller.signal
      );
    } catch (e) {
      if (e.name !== "AbortError") patchLast({ text: `⚠️ ${e.message}`, streaming: false, error: true });
    } finally {
      setBusy(false);
      refreshStats();
    }
  };

  const selectCustom = (raw) => {
    const q = raw.trim();
    if (!q) return;
    const known = customers.find(
      (c) => [c.id, c.email, c.phone?.replace(/\s/g, "")].some((k) => k?.toLowerCase() === q.replace(/\s/g, "").toLowerCase())
    );
    setCustomer(known || { id: q, name: q, avatar: q.slice(0, 2).toUpperCase(), tier: "New", plan: "Unknown", scenario: "Ad-hoc customer" });
  };

  return (
    <div className="app-shell flex h-full flex-col bg-grid">
      <Header
        health={health}
        stats={stats}
        disabled={!customer}
        onCompare={() => setCompareOpen(true)}
        onBriefing={() => setBriefingOpen(true)}
        onExplore={() => setExplorerOpen(true)}
      />

      <main className="main-grid grid min-h-0 flex-1 grid-cols-1 gap-4 p-3 lg:grid-cols-[275px_minmax(0,1fr)_400px]">
        <CustomerList
          customers={customers}
          selected={customer}
          onSelect={(c) => !busy && setCustomer(c)}
          onCustom={selectCustom}
          disabled={busy}
        />

        <section className="flex min-h-0 flex-col gap-3">
          <PipelineTracker stages={stages} busy={busy} />
          <ChatPanel
            customer={customer}
            messages={messages}
            busy={busy}
            memoryAvailable={memoryAvailable}
            onSend={send}
          />
        </section>

        <Inspector
          customer={customer}
          summary={summary}
          memories={memories}
          freshIds={freshIds}
          triage={triage}
          retained={retained}
          loading={loadingMemory || (busy && stages.recall.status === "active")}
          memoryAvailable={memoryAvailable}
          onRefresh={() => loadMemory(customer)}
          onFilter={(opts) =>
            customer && api.memories(customer.id, opts).then((m) => { setMemories(m.memories); setFreshIds(new Set()); })
          }
        />
      </main>

      {compareOpen && customer && (
        <CompareModal
          customer={customer}
          initialMessage={lastCustomerMsg || customer.try || ""}
          onClose={() => setCompareOpen(false)}
        />
      )}
      {explorerOpen && customer && <MemoryExplorer customer={customer} onClose={() => setExplorerOpen(false)} />}
      {briefingOpen && customer && <BriefingModal customer={customer} onClose={() => setBriefingOpen(false)} />}
    </div>
  );
}
