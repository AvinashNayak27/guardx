"use client";

import { AttestationInfo, type AttestationData } from "./AttestationInfo";

interface AnalysisTabProps {
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}

export function AnalysisTab({ data, loading, error }: AnalysisTabProps) {
  if (loading) {
    return (
      <div className="animate-[fade-in-up_0.4s_ease-out] rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <div className="inline-flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          <span className="font-mono text-sm text-[var(--fg-muted)]">
            Running security analysis...
          </span>
        </div>
        <div className="mt-4 flex justify-center gap-1">
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent)]"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent)]"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent)]"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-[fade-in-up_0.4s_ease-out] rounded-xl border-2 border-[var(--danger)] bg-[var(--danger)]/10 p-6">
        <p className="font-mono font-medium text-[var(--danger)]">
          ANALYSIS FAILED
        </p>
        <p className="mt-2 font-mono text-sm text-[var(--fg-muted)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-surface)]/50 p-8 text-center">
        <p className="font-mono text-sm text-[var(--fg-muted)]">
          Click ANALYZE to run the security audit.
        </p>
      </div>
    );
  }

  const analysis = data.analysis as Record<string, unknown> | undefined;
  const projectOverview = analysis?.projectOverview as
    | Record<string, unknown>
    | undefined;
  const mnemonicExposureRisks = (analysis?.mnemonicExposureRisks ??
    []) as Array<Record<string, unknown>>;
  const mnemonicUsage = (analysis?.mnemonicUsage ?? []) as Array<
    Record<string, unknown>
  >;
  const envVariables = (analysis?.envVariables ?? []) as Array<
    Record<string, unknown>
  >;
  const adminExploitPaths = (analysis?.adminExploitPaths ?? []) as Array<
    Record<string, unknown>
  >;
  const recommendations = (analysis?.recommendations ?? []) as string[];

  const metadata = data.metadata as Record<string, unknown> | undefined;
  const attestation = metadata?.attestation as
    | AttestationData
    | null
    | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <AttestationInfo
          attestation={attestation ?? null}
          label="Attestation"
        />
      </div>
      <section className="animate-[fade-in-up_0.4s_ease-out] rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] p-6">
        <h2 className="font-mono text-lg font-semibold text-[var(--accent)]">
          [ Project Overview ]
        </h2>
        {projectOverview ? (
          <div className="mt-4 space-y-2 font-mono text-sm text-[var(--fg)]">
            <p>{String(projectOverview.description || "—")}</p>
            {Array.isArray(projectOverview.techStack) &&
              projectOverview.techStack.length > 0 && (
                <p>
                  <span className="text-[var(--fg-muted)]">Tech:</span>{" "}
                  {(projectOverview.techStack as string[]).join(", ")}
                </p>
              )}
            {projectOverview.entryPoint != null && (
              <p>
                <span className="text-[var(--fg-muted)]">Entry:</span>{" "}
                {String(projectOverview.entryPoint)}
              </p>
            )}
            {Array.isArray(projectOverview.keyRoutes) &&
              projectOverview.keyRoutes.length > 0 && (
                <p>
                  <span className="text-[var(--fg-muted)]">Routes:</span>{" "}
                  {(projectOverview.keyRoutes as string[]).join(", ")}
                </p>
              )}
          </div>
        ) : (
          <p className="mt-4 font-mono text-sm text-[var(--fg-muted)]">
            No overview available
          </p>
        )}
      </section>

      {mnemonicExposureRisks.length > 0 && (
        <section className="animate-[fade-in-up_0.5s_ease-out] rounded-xl border-2 border-[var(--danger)] bg-[var(--danger)]/10 p-6">
          <h2 className="font-mono text-lg font-semibold text-[var(--danger)]">
            [ Mnemonic Exposure ]
          </h2>
          <p className="mt-2 font-mono text-sm text-[var(--fg-muted)]"></p>
          <ul className="mt-4 space-y-3">
            {mnemonicExposureRisks.map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]/60 p-3 font-mono text-sm"
              >
                <span
                  className={`font-medium ${String(r.severity) === "CRITICAL" ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}
                >
                  {String(r.pattern)}
                </span>
                {" — "}
                <span className="text-[var(--fg)]">
                  {String(r.description)}
                </span>
                {r.location != null && (
                  <span className="mt-1 block text-xs text-[var(--fg-muted)]">
                    {String(r.location)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] p-6">
        <h2 className="font-mono text-lg font-semibold text-[var(--accent)]">
          [ Summary ]
        </h2>
        <p className="mt-4 font-mono text-sm leading-relaxed text-[var(--fg)]">
          {String(analysis?.summary ?? "—")}
        </p>
      </section>

      {mnemonicUsage.length > 0 && (
        <section className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] p-6">
          <h2 className="font-mono text-lg font-semibold text-[var(--accent)]">
            [ Mnemonic Usage ]
          </h2>
          <div className="mt-4 space-y-4">
            {mnemonicUsage.map((u, i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface-secondary)]/50 p-4"
              >
                <p className="font-mono font-medium text-[var(--fg)]">
                  {String(u.function)}
                </p>
                <p className="mt-1 font-mono text-sm text-[var(--fg-muted)]">
                  {String(u.purpose)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(u.canWithdrawFunds as boolean) && (
                    <span className="rounded border border-[var(--danger)] px-2 py-0.5 font-mono text-xs font-medium text-[var(--danger)]">
                      Can withdraw funds
                    </span>
                  )}
                  {(u.canSignArbitrary as boolean) && (
                    <span className="rounded border border-[var(--warning)] px-2 py-0.5 font-mono text-xs font-medium text-[var(--warning)]">
                      Can sign arbitrary
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {envVariables.length > 0 && (
        <section className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] p-6">
          <h2 className="font-mono text-lg font-semibold text-[var(--accent)]">
            [ Environment Variables ]
          </h2>
          <ul className="mt-4 space-y-2">
            {envVariables.map((v, i) => (
              <li
                key={i}
                className="flex justify-between gap-4 font-mono text-sm"
              >
                <code className="text-[var(--fg)]">{String(v.name)}</code>
                <span
                  className={`font-medium ${
                    String(v.sensitivity) === "CRITICAL"
                      ? "text-[var(--danger)]"
                      : String(v.sensitivity) === "HIGH"
                        ? "text-[var(--warning)]"
                        : "text-[var(--fg-muted)]"
                  }`}
                >
                  {String(v.sensitivity)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adminExploitPaths.length > 0 && (
        <section className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] p-6">
          <h2 className="font-mono text-lg font-semibold text-[var(--accent)]">
            [ Admin Exploit Paths ]
          </h2>
          <ul className="mt-4 space-y-2">
            {adminExploitPaths.map((p, i) => (
              <li
                key={i}
                className="rounded border border-[var(--border)] bg-[var(--bg-surface-secondary)]/50 p-2 font-mono text-sm"
              >
                <span className="font-medium text-[var(--fg)]">
                  {String(p.path)}
                </span>
                <span
                  className={`ml-2 text-xs ${
                    String(p.severity) === "CRITICAL"
                      ? "text-[var(--danger)]"
                      : "text-[var(--fg-muted)]"
                  }`}
                >
                  {String(p.severity)}
                </span>
                <p className="mt-1 text-[var(--fg-muted)]">
                  {String(p.description)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] p-6">
          <h2 className="font-mono text-lg font-semibold text-[var(--accent)]">
            [ Recommendations ]
          </h2>
          <ul className="mt-4 list-disc space-y-1 pl-5 font-mono text-sm text-[var(--fg)]">
            {recommendations.map((r, i) => (
              <li key={i}>{String(r)}</li>
            ))}
          </ul>
        </section>
      )}

      {data.metadata != null && (
        <section className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)]/50 p-4 font-mono text-xs text-[var(--fg-muted)]">
          <p>
            Timestamp:{" "}
            {String((data.metadata as Record<string, unknown>).timestamp ?? "")}
          </p>
          <p>
            Digest:{" "}
            {String(
              (data.metadata as Record<string, unknown>).exploreDigest ?? "",
            )}
          </p>
        </section>
      )}
    </div>
  );
}
