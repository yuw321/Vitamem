"use client";

import type { ConfigResponse } from "@/lib/types";

interface ConfigSidebarProps {
  config: ConfigResponse | null;
  open: boolean;
  onClose: () => void;
}

export default function ConfigSidebar({
  config,
  open,
  onClose,
}: ConfigSidebarProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] bg-[var(--slate-dk)] border-l border-[var(--border)] shadow-2xl flex flex-col animate-fade-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <span className="text-sm font-bold text-[var(--snow)]">
            Configuration
          </span>
          <button
            onClick={onClose}
            className="text-[var(--silver)] hover:text-[var(--snow)] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Config rows */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {config ? (
            <>
              <ConfigRow label="Provider" value={config.provider} />
              <ConfigRow label="Preset" value={config.preset} />
              <ConfigRow
                label="AutoRetrieve"
                value={config.autoRetrieve ? "enabled" : "disabled"}
                highlight={config.autoRetrieve}
              />
              <ConfigRow label="Min Score" value={String(config.minScore)} />
              <ConfigRow
                label="Recency Weight"
                value={String(config.recencyWeight)}
              />
              <ConfigRow
                label="Diversity Weight"
                value={String(config.diversityWeight)}
              />
              <ConfigRow
                label="Cooling Timeout"
                value={
                  config.coolingTimeoutMs
                    ? `${config.coolingTimeoutMs}ms`
                    : "default"
                }
              />
              <ConfigRow
                label="Dormant Timeout"
                value={
                  config.dormantTimeoutMs
                    ? `${config.dormantTimeoutMs}ms`
                    : "default"
                }
              />
              <ConfigRow
                label="Closed Timeout"
                value={
                  config.closedTimeoutMs
                    ? `${config.closedTimeoutMs}ms`
                    : "default"
                }
              />
              <ConfigRow label="Demo User" value={config.demoUserId} mono />
            </>
          ) : (
            <div className="text-sm text-[var(--silver)]">Loading…</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] shrink-0">
          <p className="text-[11px] text-[var(--silver)] leading-relaxed">
            Edit <code className="text-[var(--teal-lt)]">.env</code> and restart
            to change settings.
          </p>
        </div>
      </div>
    </>
  );
}

function ConfigRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--silver)]">{label}</span>
      <span
        className={`text-xs font-semibold ${
          highlight
            ? "text-[#22c55e]"
            : mono
              ? "font-mono text-[var(--teal-lt)]"
              : "text-[var(--snow)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
