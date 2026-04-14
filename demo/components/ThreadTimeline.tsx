"use client";

// ---------------------------------------------------------------------------
// Thread Lifecycle Timeline — visual aid for Demo 3
// ---------------------------------------------------------------------------

const LIFECYCLE_STATES = ["active", "cooling", "dormant", "closed"] as const;
type LifecycleState = (typeof LIFECYCLE_STATES)[number];

interface ThreadEntry {
  id: string;
  state: LifecycleState;
  label?: string;
}

export interface ThreadTimelineProps {
  threads: ThreadEntry[];
}

const STATE_LABELS: Record<LifecycleState, string> = {
  active: "Active",
  cooling: "Cooling",
  dormant: "Dormant",
  closed: "Closed",
};

const STATE_COLORS: Record<LifecycleState, { bg: string; border: string; text: string; glow: string }> = {
  active: {
    bg: "rgba(20,184,166,0.15)",
    border: "rgba(20,184,166,0.6)",
    text: "var(--teal-lt)",
    glow: "0 0 12px rgba(20,184,166,0.4)",
  },
  cooling: {
    bg: "rgba(250,204,21,0.12)",
    border: "rgba(250,204,21,0.5)",
    text: "#facc15",
    glow: "0 0 10px rgba(250,204,21,0.25)",
  },
  dormant: {
    bg: "rgba(148,163,184,0.1)",
    border: "rgba(148,163,184,0.4)",
    text: "var(--silver)",
    glow: "none",
  },
  closed: {
    bg: "rgba(100,116,139,0.08)",
    border: "rgba(100,116,139,0.3)",
    text: "var(--silver)",
    glow: "none",
  },
};

function stateIndex(state: LifecycleState): number {
  return LIFECYCLE_STATES.indexOf(state);
}

// ---------------------------------------------------------------------------
// Single thread row
// ---------------------------------------------------------------------------

function ThreadRow({ thread }: { thread: ThreadEntry }) {
  const currentIdx = stateIndex(thread.state);

  return (
    <div className="flex items-center gap-1">
      {/* Label */}
      <span className="text-[11px] text-[var(--silver)] w-[60px] shrink-0 text-right pr-2 font-medium tracking-wide">
        {thread.label ?? thread.id.slice(0, 6)}
      </span>

      {/* State nodes + connectors */}
      <div className="flex items-center gap-0 flex-1">
        {LIFECYCLE_STATES.map((state, i) => {
          const isCurrent = i === currentIdx;
          const isPast = i < currentIdx;
          const isFuture = i > currentIdx;
          const colors = STATE_COLORS[state];

          return (
            <div key={state} className="flex items-center">
              {/* Connector line (before node, skip first) */}
              {i > 0 && (
                <div
                  className="h-[2px] w-[32px] sm:w-[48px] transition-all duration-500"
                  style={{
                    background: isPast || isCurrent
                      ? `linear-gradient(90deg, ${STATE_COLORS[LIFECYCLE_STATES[i - 1]].border}, ${colors.border})`
                      : "rgba(148,163,184,0.15)",
                  }}
                />
              )}

              {/* State node */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="relative flex items-center justify-center transition-all duration-500"
                  style={{
                    width: isCurrent ? 36 : 28,
                    height: isCurrent ? 36 : 28,
                    borderRadius: "50%",
                    background: isCurrent || isPast ? colors.bg : "rgba(255,255,255,0.03)",
                    border: `2px solid ${isCurrent || isPast ? colors.border : "rgba(148,163,184,0.15)"}`,
                    boxShadow: isCurrent ? colors.glow : "none",
                    opacity: isFuture ? 0.35 : 1,
                  }}
                >
                  {/* Icon / indicator */}
                  {isPast && (
                    <span style={{ color: colors.text, fontSize: 12 }}>✓</span>
                  )}
                  {isCurrent && (
                    <span
                      className="block rounded-full animate-pulse"
                      style={{
                        width: 8,
                        height: 8,
                        background: colors.text,
                      }}
                    />
                  )}
                  {isFuture && (
                    <span
                      className="block rounded-full"
                      style={{
                        width: 5,
                        height: 5,
                        background: "rgba(148,163,184,0.25)",
                      }}
                    />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium tracking-wide transition-all duration-300"
                  style={{
                    color: isCurrent ? colors.text : isFuture ? "rgba(148,163,184,0.35)" : "var(--silver)",
                  }}
                >
                  {STATE_LABELS[state]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arrow indicating redirect / branch
// ---------------------------------------------------------------------------

function BranchIndicator() {
  return (
    <div className="flex items-center gap-1 pl-[68px] py-0.5">
      <svg width="20" height="20" viewBox="0 0 20 20" className="text-[var(--teal-lt)] opacity-60">
        <path
          d="M4 2 L4 14 L10 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="3 2"
        />
        <polygon points="10,11 10,17 15,14" fill="currentColor" />
      </svg>
      <span className="text-[10px] text-[var(--teal-lt)] opacity-70 tracking-wide">
        redirected
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ThreadTimeline({ threads }: ThreadTimelineProps) {
  if (!threads || threads.length === 0) return null;

  return (
    <div className="bg-[var(--slate)] border border-[var(--border)] rounded-xl overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <svg
          className="w-4 h-4 text-[var(--teal-lt)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--silver)]">
          Thread Lifecycle
        </span>
      </div>

      {/* Timeline rows */}
      <div className="px-4 py-4 space-y-1">
        {threads.map((thread, i) => (
          <div key={thread.id}>
            {i > 0 && <BranchIndicator />}
            <ThreadRow thread={thread} />
          </div>
        ))}
      </div>
    </div>
  );
}
