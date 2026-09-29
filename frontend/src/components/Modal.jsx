import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ title, subtitle, icon: Icon, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`panel flex max-h-[90vh] w-full animate-fade-up flex-col bg-slate-900/95 shadow-2xl ${wide ? "max-w-5xl" : "max-w-2xl"}`}
      >
        <div className="flex items-start gap-3 border-b border-white/5 p-4">
          {Icon && (
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500/15">
              <Icon className="text-indigo-300" size={18} />
            </div>
          )}
          <div className="flex-1">
            <h2 className="font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
