"use client";

import { useState, useCallback, useEffect } from "react";
import type { ConfigResponse } from "@/lib/types";

interface CognitiveMemoryPanelProps {
  config: ConfigResponse | null;
  onConfigChange?: (updated: ConfigResponse) => void;
}

export default function CognitiveMemoryPanel({
  config,
  onConfigChange,
}: CognitiveMemoryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Local state for cognitive controls
  const [enableReflection, setEnableReflection] = useState(true);
  const [prioritySignaling, setPrioritySignaling] = useState(true);
  const [chronologicalRetrieval, setChronologicalRetrieval] = useState(true);
  const [cacheableContext, setCacheableContext] = useState(true);
  const [halfLifeDays, setHalfLifeDays] = useState(180);
  const [minRetrievalScore, setMinRetrievalScore] = useState(0.1);

  // Sync local state when config prop changes
  useEffect(() => {
    if (!config) return;
    setEnableReflection(config.enableReflection ?? true);
    setPrioritySignaling(config.prioritySignaling ?? true);
    setChronologicalRetrieval(config.chronologicalRetrieval ?? true);
    setCacheableContext(config.cacheableContext ?? true);
    setHalfLifeDays(
      config.forgetting
        ? Math.round(config.forgetting.forgettingHalfLifeMs / 86400000)
        : 180
    );
    setMinRetrievalScore(config.forgetting?.minRetrievalScore ?? 0.1);
  }, [config]);

  // Persist a partial config update
  const persist = useCallback(
    async (key: string, payload: Record<string, unknown>) => {
      setSaving(key);
      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated: ConfigResponse = await res.json();
          onConfigChange?.(updated);
        }
      } catch {
        /* best-effort */
      } finally {
        setTimeout(() => setSaving(null), 800);
      }
    },
    [onConfigChange]
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--slate-dk)] overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--teal-lt)]">
          Cognitive Memory
        </span>
        <svg
          className={`w-3.5 h-3.5 text-[var(--silver)] transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-0">
          {/* Toggle: Reflection Pass */}
          <ToggleControl
            label="Reflection Pass"
            description="Second LLM call validates extraction accuracy"
            checked={enableReflection}
            saving={saving === "enableReflection"}
            onChange={(v) => {
              setEnableReflection(v);
              persist("enableReflection", { enableReflection: v });
            }}
          />

          {/* Toggle: Priority Signaling */}
          <ToggleControl
            label="Priority Signaling"
            description="Tag memories as CRITICAL / IMPORTANT / INFO"
            checked={prioritySignaling}
            saving={saving === "prioritySignaling"}
            onChange={(v) => {
              setPrioritySignaling(v);
              persist("prioritySignaling", { prioritySignaling: v });
            }}
          />

          {/* Toggle: Chronological Retrieval */}
          <ToggleControl
            label="Chronological Retrieval"
            description="Group retrieved memories by time period"
            checked={chronologicalRetrieval}
            saving={saving === "chronologicalRetrieval"}
            onChange={(v) => {
              setChronologicalRetrieval(v);
              persist("chronologicalRetrieval", { chronologicalRetrieval: v });
            }}
          />

          {/* Toggle: Cache-Friendly Context */}
          <ToggleControl
            label="Cache-Friendly Context"
            description="Stable prefix + dynamic suffix for prompt caching"
            checked={cacheableContext}
            saving={saving === "cacheableContext"}
            onChange={(v) => {
              setCacheableContext(v);
              persist("cacheableContext", { cacheableContext: v });
            }}
          />

          {/* Slider: Forgetting Half-Life */}
          <SliderControl
            label="Forgetting Half-Life"
            description="Days until unretrieved memory relevance halves"
            value={halfLifeDays}
            min={30}
            max={365}
            step={1}
            unit="days"
            saving={saving === "forgettingHalfLife"}
            onChange={(v) => setHalfLifeDays(v)}
            onChangeEnd={(v) => {
              persist("forgettingHalfLife", {
                forgetting: {
                  forgettingHalfLifeMs: v * 86400000,
                  minRetrievalScore,
                },
              });
            }}
          />

          {/* Slider: Min Retrieval Score */}
          <SliderControl
            label="Min Retrieval Score"
            description="Memories below this score are candidates for archival"
            value={minRetrievalScore}
            min={0}
            max={1}
            step={0.05}
            saving={saving === "minRetrievalScore"}
            onChange={(v) => setMinRetrievalScore(Math.round(v * 100) / 100)}
            onChangeEnd={(v) => {
              persist("minRetrievalScore", {
                forgetting: {
                  forgettingHalfLifeMs: halfLifeDays * 86400000,
                  minRetrievalScore: Math.round(v * 100) / 100,
                },
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function ToggleControl({
  label,
  description,
  checked,
  saving,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  saving: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--snow)] font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] text-[#22c55e] animate-pulse">
              Saved
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
              checked ? "bg-[var(--teal)]" : "bg-[var(--border)]"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
                checked ? "translate-x-[18px]" : "translate-x-[3px]"
              }`}
            />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--silver)] mt-0.5 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function SliderControl({
  label,
  description,
  value,
  min,
  max,
  step,
  unit,
  saving,
  onChange,
  onChangeEnd,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  saving: boolean;
  onChange: (v: number) => void;
  onChangeEnd: (v: number) => void;
}) {
  const displayValue = step < 1 ? value.toFixed(2) : String(value);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--snow)] font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] text-[#22c55e] animate-pulse">
              Saved
            </span>
          )}
          <span className="text-xs font-mono text-[var(--teal-lt)]">
            {displayValue}
            {unit ? ` ${unit}` : ""}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) =>
          onChangeEnd(Number((e.target as HTMLInputElement).value))
        }
        onTouchEnd={(e) =>
          onChangeEnd(Number((e.target as HTMLInputElement).value))
        }
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
            const target = e.target as HTMLInputElement;
            onChangeEnd(Number(target.value));
          }
        }}
        onBlur={(e) => {
          const target = e.target as HTMLInputElement;
          onChangeEnd(Number(target.value));
        }}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[var(--border)] accent-[var(--teal)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--teal-lt)] [&::-webkit-slider-thumb]:shadow"
      />
      <p className="text-[10px] text-[var(--silver)] mt-0.5 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
