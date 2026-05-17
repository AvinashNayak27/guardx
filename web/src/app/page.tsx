"use client";

import { useRef, useState } from "react";
import {
  getLatestAnalysisByApp,
  isAnalysisReport,
  parseEigenVerifyLink,
  postChatByApp,
  refreshAnalysisByApp,
  type AnalysisJobResponse,
} from "@/lib/api";
import { AnalysisTab } from "@/components/AnalysisTab";
import { ChatTab } from "@/components/ChatTab";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AttestationData } from "@/components/AttestationInfo";

type Tab = "analysis" | "chat";

export default function Home() {
  const analysisRequestId = useRef(0);
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<{
    appId: string;
    network: string;
    resolvedImageRef?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("analysis");

  const [analysisData, setAnalysisData] = useState<Record<string, unknown> | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string; attestation?: AttestationData | null }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const applyResolvedImageRef = (response: AnalysisJobResponse) => {
    const resolvedRef = response.metadata?.resolvedImageRef;
    if (resolvedRef) {
      setParsed((prev) => (prev ? { ...prev, resolvedImageRef: resolvedRef } : null));
    }
  };

  const waitForLatestAnalysis = async (
    network: string,
    appId: string,
    isCurrentRequest: () => boolean
  ) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!isCurrentRequest()) return;

      const latest = await getLatestAnalysisByApp(network, appId);
      if (!isCurrentRequest()) return;
      applyResolvedImageRef(latest);

      if (isAnalysisReport(latest)) {
        setAnalysisData(latest);
        return;
      }

      if (latest.status === "failed") {
        setAnalysisError(latest.error ?? "Analysis failed");
        return;
      }
    }

    if (isCurrentRequest()) {
      setAnalysisError("Analysis is still running. Check the latest report again in a moment.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const requestId = analysisRequestId.current + 1;
    analysisRequestId.current = requestId;
    const isCurrentRequest = () => analysisRequestId.current === requestId;

    setError("");
    setAnalysisError(null);
    const p = parseEigenVerifyLink(input);
    if (!p) {
      setError("Invalid Eigen Verify link. Use Sepolia or mainnet URL: verify-sepolia.eigencloud.xyz or verify.eigencloud.xyz");
      return;
    }
    setParsed({ ...p });
    setChatMessages([]);
    setChatError(null);

    setAnalysisLoading(true);
    setAnalysisData(null);
    try {
      const initial = await getLatestAnalysisByApp(p.network, p.appId);
      if (!isCurrentRequest()) return;
      applyResolvedImageRef(initial);

      if (isAnalysisReport(initial)) {
        setAnalysisData(initial);
        return;
      }

      if (initial.status === "failed") {
        setAnalysisError(initial.error ?? "Analysis failed");
        return;
      }

      if (initial.status === "idle") {
        const refreshed = await refreshAnalysisByApp(p.network, p.appId);
        if (!isCurrentRequest()) return;
        applyResolvedImageRef(refreshed);

        if (isAnalysisReport(refreshed)) {
          setAnalysisData(refreshed);
          return;
        }

        if (refreshed.status === "failed") {
          setAnalysisError(refreshed.error ?? "Analysis failed");
          return;
        }
      }

      await waitForLatestAnalysis(p.network, p.appId, isCurrentRequest);
    } catch (err) {
      if (isCurrentRequest()) {
        setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
      }
    } finally {
      if (isCurrentRequest()) {
        setAnalysisLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className="text-3xl tracking-wider text-[var(--accent)] animate-[fade-in-up_0.5s_ease-out] sm:text-4xl"
                style={{ fontFamily: "var(--font-dotted), var(--font-vt323), monospace" }}
              >
                &gt;_ Guardx Agent
              </h1>
              <p className="mt-1 font-mono text-sm text-[var(--fg-muted)] animate-[fade-in-up_0.6s_ease-out]">
                [ Verifiable security audit agent for Eigen Compute applications ]
              </p>
            </div>
            <ThemeToggle />
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-6 flex gap-2 animate-[fade-in-up_0.7s_ease-out]"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://verify.eigencloud.xyz/app/0x... or verify-sepolia..."
              className="font-mono flex-1 rounded border-2 border-[var(--border)] bg-[var(--bg-surface-secondary)] px-4 py-2.5 text-[var(--fg)] placeholder-[var(--fg-muted)] transition-all duration-200 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)]"
            />
            <button
              type="submit"
              className="rounded border-2 border-[var(--accent)] bg-[var(--accent)] px-5 py-2.5 font-mono font-medium text-[#0a0e14] transition-all duration-200 hover:shadow-[0_0_12px_var(--accent-glow)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg)]"
            >
              ANALYZE
            </button>
          </form>

          {error && (
            <p className="mt-2 font-mono text-sm text-[var(--danger)] animate-[glitch_0.3s_ease-in-out]">
              ERROR: {error}
            </p>
          )}
        </div>
      </header>

      {parsed && (
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="mb-4 flex gap-2">
            <TabButton
              active={activeTab === "analysis"}
              onClick={() => setActiveTab("analysis")}
            >
              Analysis
            </TabButton>
            <TabButton
              active={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </TabButton>
          </div>

          <p className="mb-4 font-mono text-sm text-[var(--fg-muted)]">
            $ app: {parsed.appId} ({parsed.network})
            {parsed.resolvedImageRef && (
              <span className="ml-2 text-[var(--accent)]">
                → {parsed.resolvedImageRef}
              </span>
            )}
          </p>

          {activeTab === "analysis" && (
            <AnalysisTab
              data={analysisData}
              loading={analysisLoading}
              error={analysisError}
            />
          )}
          {activeTab === "chat" && (
            <ChatTab
              network={parsed.network}
              appId={parsed.appId}
              messages={chatMessages}
              loading={chatLoading}
              error={chatError}
              onSend={async (message, history) => {
                setChatError(null);
                setChatMessages((m) => [...m, { role: "user", content: message }]);
                setChatLoading(true);
                try {
                  const res = await postChatByApp(parsed.network, parsed.appId, message, history) as { reply: string; attestation?: AttestationData | null };
                  setChatMessages((m) => [...m, { role: "assistant", content: res.reply, attestation: res.attestation ?? null }]);
                } catch (e) {
                  setChatError(e instanceof Error ? e.message : "Chat failed");
                  setChatMessages((m) => m.slice(0, -1));
                } finally {
                  setChatLoading(false);
                }
              }}
            />
          )}
        </div>
      )}

      {!parsed && (
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p
            className="font-mono text-lg text-[var(--fg-muted)]"
            style={{ animation: "fade-in-up 0.6s ease-out" }}
          >
            &gt; Enter an Eigen Verify link
          </p>
          <p className="mt-3 font-mono text-sm text-[var(--fg-muted)]">
            e.g.{" "}
            <code className="rounded border border-[var(--border)] bg-[var(--bg-surface-secondary)] px-2 py-1 text-[var(--accent)] break-all">
              https://verify.eigencloud.xyz/app/0x... (mainnet) or verify-sepolia.eigencloud.xyz (testnet)
            </code>
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--fg-muted)] opacity-80">
            Run security analysis and chat with the AI agent.
          </p>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono rounded border-2 px-4 py-2 text-sm font-medium transition-all duration-200 ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-[#0a0e14] shadow-[0_0_8px_var(--accent-glow)]"
          : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--fg-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--fg)]"
      }`}
    >
      {children}
    </button>
  );
}
