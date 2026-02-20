"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AttestationInfo, type AttestationData } from "./AttestationInfo";

interface Message {
  role: "user" | "assistant";
  content: string;
  attestation?: AttestationData | null;
}

interface ChatTabProps {
  network: string;
  appId: string;
  messages: Message[];
  loading: boolean;
  error: string | null;
  onSend: (message: string, history: Array<{ role: string; content: string }>) => Promise<void>;
}

export function ChatTab({ messages, loading, error, onSend }: ChatTabProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    await onSend(msg, history);
  };

  return (
    <div className="flex flex-col animate-[fade-in-up_0.4s_ease-out] rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="flex-1 overflow-y-auto p-4 min-h-[320px]">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <p className="font-mono text-sm text-[var(--fg-muted)]">
              Ask questions about this Docker image&apos;s code.
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--fg-muted)]">
              Try: &quot;What does this app do?&quot; or &quot;Where is the mnemonic used?&quot;
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-4 flex items-start gap-1.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`inline-block max-w-[85%] rounded-lg border-2 px-4 py-2 font-mono text-sm text-left ${
                m.role === "user"
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[#0a0e14]"
                  : "border-[var(--border)] bg-[var(--bg-surface-secondary)]/50 text-[var(--fg)] [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/20 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_code]:rounded [&_code]:bg-black/20 [&_code]:px-1.5 [&_code]:py-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm"
              }`}
            >
              {m.role === "user" ? (
                <span>&gt; {m.content}</span>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.content}
                </ReactMarkdown>
              )}
            </div>
            {m.role === "assistant" && (
              <AttestationInfo attestation={m.attestation ?? null} label="Attestation" />
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 py-2">
            <span className="font-mono text-xs text-[var(--fg-muted)]">&gt;</span>
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="px-4 py-2 font-mono text-sm text-[var(--danger)]">ERROR: {error}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2 border-t-2 border-[var(--border)] p-4"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the code..."
          disabled={loading}
          className="font-mono flex-1 rounded border-2 border-[var(--border)] bg-[var(--bg-surface-secondary)] px-4 py-2.5 text-sm text-[var(--fg)] placeholder-[var(--fg-muted)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded border-2 border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 font-mono font-medium text-[#0a0e14] transition-all hover:shadow-[0_0_8px_var(--accent-glow)] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
        >
          SEND
        </button>
      </form>
    </div>
  );
}
