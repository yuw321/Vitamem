"use client";

import type { UserProfile } from "vitamem";

interface ProfileCardProps {
  profile: UserProfile | null;
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const isEmpty =
    !profile ||
    (profile.conditions.length === 0 &&
      profile.medications.length === 0 &&
      profile.allergies.length === 0 &&
      Object.keys(profile.vitals).length === 0 &&
      profile.goals.length === 0);

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
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--silver)]">
          User Profile
        </span>
      </div>

      <div className="px-4 py-3">
        {isEmpty ? (
          <p className="text-[12px] text-[var(--silver)] leading-relaxed">
            No profile data yet — complete Demo 1 to build the user&apos;s profile.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Conditions */}
            {profile!.conditions.length > 0 && (
              <Section label="Conditions">
                <div className="flex flex-wrap gap-1.5">
                  {profile!.conditions.map((c, i) => (
                    <Badge key={i} color="teal">
                      {c}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Medications */}
            {profile!.medications.length > 0 && (
              <Section label="Medications">
                <div className="space-y-1">
                  {profile!.medications.map((m, i) => (
                    <div key={i} className="text-[12px] text-[var(--mist)]">
                      <span className="text-[var(--snow)] font-medium">{m.name}</span>
                      {m.dosage && (
                        <span className="text-[var(--silver)]"> — {m.dosage}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Allergies */}
            {profile!.allergies.length > 0 && (
              <Section label="Allergies">
                <div className="flex flex-wrap gap-1.5">
                  {profile!.allergies.map((a, i) => (
                    <Badge key={i} color="rose">
                      {a}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Vitals */}
            {profile!.vitals && Object.keys(profile!.vitals).length > 0 ? (
              <Section label="Vitals">
                <div className="space-y-1">
                  {Object.entries(profile!.vitals).map(([key, record]) => {
                    if (!record) return null;
                    const displayKey = key
                      .split("_")
                      .map((w) =>
                        w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)
                      )
                      .join(" ");
                    return (
                      <div
                        key={key}
                        className="flex items-baseline gap-1.5 text-[12px]"
                      >
                        <span className="text-[var(--silver)] uppercase tracking-wide text-[10px] min-w-[48px]">
                          {displayKey}
                        </span>
                        <span className="text-[var(--snow)] font-medium">
                          {record.value}
                          {record.unit ?? ""}
                        </span>
                        {record.previousValue != null && (
                          <span className="text-[var(--silver)] text-[11px]">
                            {record.value < record.previousValue ? "↓" : record.value > record.previousValue ? "↑" : "="}{" "}
                            from {record.previousValue}
                            {record.unit ?? ""}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            ) : (
              <Section label="Vitals">
                <p className="text-[12px] text-[var(--silver)]">No vitals recorded</p>
              </Section>
            )}

            {/* Goals */}
            {profile!.goals.length > 0 && (
              <Section label="Goals">
                <ul className="space-y-0.5">
                  {profile!.goals.map((g, i) => (
                    <li
                      key={i}
                      className="text-[12px] text-[var(--mist)] flex items-start gap-1.5"
                    >
                      <span className="text-[var(--teal-lt)] mt-[2px]">•</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--silver)] mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "teal" | "rose";
}) {
  const colorClasses =
    color === "rose"
      ? "bg-[rgba(244,63,94,0.12)] text-[var(--rose)] border-[rgba(244,63,94,0.25)]"
      : "bg-[var(--teal-glow)] text-[var(--teal-lt)] border-[rgba(20,184,166,0.25)]";

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] border ${colorClasses}`}
    >
      {children}
    </span>
  );
}
