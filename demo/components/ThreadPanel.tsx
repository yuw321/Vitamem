"use client";

export interface ThreadInfo {
  id: string;
  state: string;
  messageCount?: number;
  createdAt?: string;
}

interface ThreadPanelProps {
  currentThread: ThreadInfo | null;
  threads: ThreadInfo[];
  messageCount: number;
  memoryCount: number;
  embedCount: number;
  onEndSession: () => void;
  onNewSession: () => void;
  onSweep: () => void;
  onCloseThread: () => void;
  isLoading: boolean;
}

const STATE_STYLES: Record<string, string> = {
  active:
    "bg-[rgba(34,197,94,0.15)] text-[#22c55e] border-[rgba(34,197,94,0.3)]",
  cooling:
    "bg-[rgba(245,158,11,0.15)] text-[#f59e0b] border-[rgba(245,158,11,0.3)]",
  dormant:
    "bg-[rgba(148,163,184,0.1)] text-[var(--silver)] border-[rgba(148,163,184,0.2)]",
  closed:
    "bg-[rgba(100,116,139,0.1)] text-[#64748b] border-[rgba(100,116,139,0.2)]",
};

export default function ThreadPanel({
  currentThread,
  threads,
  messageCount,
  memoryCount,
  embedCount,
  onEndSession,
  onNewSession,
  onSweep,
  onCloseThread,
  isLoading,
}: ThreadPanelProps) {
  const state = currentThread?.state ?? "—";
  const stateStyle =
    STATE_STYLES[state] ??
    "bg-[var(--teal-glow)] text-[var(--teal-lt)] border-[rgba(20,184,166,0.3)]";

  return (
    <div
      id="thread-panel"
      className="bg-[var(--slate)] border border-[var(--border)] rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--silver)]">
          Thread Info
        </span>
        {currentThread && (
          <span
            className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full border transition-all duration-300 ${stateStyle}`}
          >
            {state}
          </span>
        )}
      </div>

      {/* Info rows */}
      <div className="px-4 py-3 space-y-2.5">
        <InfoRow label="Thread" value={currentThread?.id?.slice(0, 12) ?? "—"} mono />
        <InfoRow label="Messages" value={String(messageCount)} />
        <InfoRow label="Memories" value={String(memoryCount)} />
        <InfoRow label="Embed calls" value={String(embedCount)} mono />
      </div>

      {/* Lifecycle buttons */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <button
          onClick={onEndSession}
          disabled={isLoading || !currentThread || state !== "active"}
          className="flex-1 min-w-[100px] text-xs font-semibold px-3 py-2 rounded-lg bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.3)] text-[#f59e0b] hover:bg-[rgba(245,158,11,0.25)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          End Session
        </button>
        <button
          onClick={onNewSession}
          disabled={isLoading}
          className="flex-1 min-w-[100px] text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--teal)] text-white hover:bg-[var(--teal-mid)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          New Session
        </button>
      </div>
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <button
          onClick={onSweep}
          disabled={isLoading}
          className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.06)] border border-[var(--border)] text-[var(--silver)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--snow)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Sweep Threads
        </button>
        <button
          onClick={onCloseThread}
          disabled={isLoading || state !== "dormant"}
          className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.06)] border border-[var(--border)] text-[var(--silver)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--snow)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Close Thread
        </button>
      </div>

      {/* Thread list */}
      {threads.length > 1 && (
        <div className="border-t border-[var(--border)]">
          <div className="px-4 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--silver)]">
              All Threads
            </span>
          </div>
          <div className="max-h-32 overflow-y-auto px-2 pb-2 space-y-1">
            {threads.map((t) => {
              const ts = STATE_STYLES[t.state] ?? stateStyle;
              return (
                <div
                  key={t.id}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] ${
                    t.id === currentThread?.id
                      ? "bg-[rgba(255,255,255,0.06)]"
                      : "hover:bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  <span className="font-mono text-[var(--teal-lt)] truncate mr-2">
                    {t.id.slice(0, 10)}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${ts}`}
                  >
                    {t.state}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--silver)]">{label}</span>
      <span
        className={`text-xs font-semibold ${
          mono
            ? "font-mono text-[var(--teal-lt)]"
            : "text-[var(--snow)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
