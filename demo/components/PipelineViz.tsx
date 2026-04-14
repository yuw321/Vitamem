"use client";

import { useEffect, useState } from "react";

export interface PipelineState {
  currentStep: number;
  steps: Array<{
    name: string;
    description: string;
    status: "pending" | "active" | "done";
    data?: string;
  }>;
}

interface PipelineVizProps {
  pipeline: PipelineState | null;
  visible: boolean;
}

export default function PipelineViz({ pipeline, visible }: PipelineVizProps) {
  if (!visible || !pipeline) return null;

  return (
    <div id="pipeline-viz" className="bg-[var(--slate)] border border-[var(--border)] rounded-xl overflow-hidden animate-fade-in">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--silver)]">
          Extraction Pipeline
        </span>
      </div>
      <div className="px-4 py-3 space-y-0">
        {pipeline.steps.map((step, i) => (
          <PipelineStep key={i} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}

function PipelineStep({
  step,
  index,
}: {
  step: PipelineState["steps"][number];
  index: number;
}) {
  const opacityClass =
    step.status === "pending"
      ? "opacity-30"
      : step.status === "done"
        ? "opacity-70"
        : "opacity-100";

  const iconBg =
    step.status === "active"
      ? "bg-[var(--teal-glow)] border-[rgba(20,184,166,0.3)] text-[var(--teal-lt)]"
      : step.status === "done"
        ? "bg-[rgba(34,197,94,0.1)] border-[rgba(34,197,94,0.3)] text-[#22c55e]"
        : "bg-[rgba(255,255,255,0.04)] border-[var(--border)] text-[var(--silver)]";

  return (
    <div
      className={`flex items-center gap-2.5 py-2 border-b border-[var(--border)] last:border-b-0 text-[13px] transition-opacity duration-300 ${opacityClass}`}
    >
      <div
        className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] shrink-0 border ${iconBg} ${
          step.status === "active" ? "pipeline-active-glow" : ""
        }`}
      >
        {step.status === "done" ? (
          "✓"
        ) : step.status === "active" ? (
          <span className="animate-spin inline-block w-3 h-3 border-2 border-[var(--teal-lt)] border-t-transparent rounded-full" />
        ) : (
          index + 1
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[var(--snow)] text-[13px]">{step.name}</div>
        <div className="text-[11px] text-[var(--silver)]">
          {step.data ?? step.description}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline animation helper — call from page.tsx
// ---------------------------------------------------------------------------

export interface PipelineData {
  extractedFacts: number;
  profileFieldsUpdated: number;
  embeddingCount: number;
  deduplicatedCount: number;
  supersededCount: number;
  savedCount: number;
  reflectionResult?: {
    correctionsCount: number;
    missedFactsCount: number;
    conflictsCount: number;
  };
  reflectionEnabled?: boolean;
}

function reflectionDataString(r: NonNullable<PipelineData["reflectionResult"]>): string {
  const total = r.correctionsCount + r.missedFactsCount + r.conflictsCount;
  const parts: string[] = [];
  if (r.correctionsCount > 0) parts.push(`${r.correctionsCount} correction${r.correctionsCount !== 1 ? "s" : ""}`);
  if (r.missedFactsCount > 0) parts.push(`${r.missedFactsCount} enrichment${r.missedFactsCount !== 1 ? "s" : ""}`);
  if (r.conflictsCount > 0) parts.push(`${r.conflictsCount} conflict${r.conflictsCount !== 1 ? "s" : ""}`);
  if (parts.length === 0) return `Validated — 0 corrections`;
  return `Found ${parts.join(", ")}`;
}

export function createPipelineSteps(data?: PipelineData): PipelineState {
  const steps: PipelineState["steps"] = [
    {
      name: "LLM extraction",
      description: "1 API call · full conversation",
      status: "pending",
      data: data
        ? `${data.extractedFacts} facts extracted`
        : undefined,
    },
  ];

  // Conditionally insert the reflection step when enabled
  if (data?.reflectionEnabled && data.reflectionResult) {
    steps.push({
      name: "Reflection validation",
      description: "Second LLM pass validates accuracy and catches missed facts",
      status: "pending",
      data: reflectionDataString(data.reflectionResult),
    });
  }

  steps.push(
    {
      name: "Profile updated",
      description: "structured field classification",
      status: "pending",
      data: data
        ? `${data.profileFieldsUpdated} fields updated`
        : undefined,
    },
    {
      name: "Embedding facts",
      description: "N embedding calls",
      status: "pending",
      data: data
        ? `${data.embeddingCount} embedding calls`
        : undefined,
    },
    {
      name: "Deduplication",
      description: "cosine ≥ 0.92",
      status: "pending",
      data: data
        ? `${data.deduplicatedCount} duplicates filtered`
        : undefined,
    },
    {
      name: "Memories updated",
      description: "supersede stale facts",
      status: "pending",
      data: data
        ? `${data.supersededCount} memories superseded`
        : undefined,
    },
    {
      name: "Saved to storage",
      description: "N memories stored",
      status: "pending",
      data: data ? `${data.savedCount} memories saved` : undefined,
    },
  );

  return { currentStep: -1, steps };
}

/**
 * Sequentially animates pipeline steps. Returns a promise that resolves
 * when all steps are done.
 */
export function animatePipeline(
  setPipeline: React.Dispatch<React.SetStateAction<PipelineState | null>>,
  data?: PipelineData
): Promise<void> {
  // Base delays for the 6 original steps
  const baseDelays = [800, 500, 1200, 700, 500, 600];
  // When reflection is enabled, insert a delay for the reflection step after LLM extraction
  const delays =
    data?.reflectionEnabled && data.reflectionResult
      ? [baseDelays[0], 900, ...baseDelays.slice(1)]
      : baseDelays;

  return new Promise<void>((resolve) => {
    const pipeline = createPipelineSteps(data);
    setPipeline(pipeline);

    let stepIndex = 0;

    function advanceStep() {
      if (stepIndex >= pipeline.steps.length) {
        resolve();
        return;
      }

      // Set current step to active
      setPipeline((prev) => {
        if (!prev) return prev;
        const next = { ...prev, currentStep: stepIndex };
        next.steps = prev.steps.map((s, i) => ({
          ...s,
          status:
            i < stepIndex ? "done" : i === stepIndex ? "active" : "pending",
        }));
        return next;
      });

      // After delay, mark done and move on
      setTimeout(() => {
        setPipeline((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          next.steps = prev.steps.map((s, i) => ({
            ...s,
            status: i <= stepIndex ? "done" : s.status,
          }));
          return next;
        });
        stepIndex++;
        setTimeout(advanceStep, 200);
      }, delays[stepIndex] ?? 600);
    }

    // Kick off
    setTimeout(advanceStep, 300);
  });
}
