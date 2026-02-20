"use client";

import { useState } from "react";

export interface AttestationData {
  signerAddress: string;
  signedPayload: string;
  contentHash?: string;
  signature: string;
  timestamp: string;
}

interface AttestationInfoProps {
  attestation: AttestationData | null;
  label?: string;
}

export function AttestationInfo({ attestation, label = "Attestation" }: AttestationInfoProps) {
  const [open, setOpen] = useState(false);

  if (!attestation) {
    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="View attestation details"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--bg-surface-secondary)] font-mono text-xs font-medium text-[var(--fg-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--fg)]"
        >
          i
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
            <div
              className="absolute right-0 top-8 z-50 min-w-[240px] max-w-sm rounded-lg border-2 border-[var(--border)] bg-[var(--bg-surface)] p-4 font-mono text-sm text-[var(--fg)] shadow-xl"
            >
              <h3 className="font-semibold text-[var(--accent)]">No attestation</h3>
              <p className="mt-2 text-xs text-[var(--fg-muted)]">
                Set <code className="rounded border border-[var(--border)] bg-[var(--bg-surface-secondary)] px-1">ATTESTATION_MNEMONIC</code> or <code className="rounded border border-[var(--border)] bg-[var(--bg-surface-secondary)] px-1">MNEMONIC</code> on the server to sign responses.
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="View attestation details"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--accent)]/20 font-mono text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30"
      >
        i
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-8 z-50 min-w-[320px] max-w-md rounded-lg border-2 border-[var(--border)] bg-[var(--bg-surface)] p-4 font-mono shadow-xl"
            style={{ color: "var(--fg)" }}
          >
            <h3 className="text-sm font-semibold text-[var(--accent)]">{label}</h3>
            <div className="mt-3 space-y-2 text-xs">
              <div>
                <span className="block font-medium text-[var(--fg-muted)]">Signer</span>
                <span className="break-all text-[var(--fg)]">{attestation.signerAddress}</span>
              </div>
              <div>
                <span className="block font-medium text-[var(--fg-muted)]">Timestamp</span>
                <span className="text-[var(--fg)]">{attestation.timestamp}</span>
              </div>
              {attestation.contentHash != null && (
                <div>
                  <span className="block font-medium text-[var(--fg-muted)]">Content hash</span>
                  <span className="break-all text-[var(--fg)]">{attestation.contentHash}</span>
                </div>
              )}
              <div>
                <span className="block font-medium text-[var(--fg-muted)]">Signature</span>
                <span className="break-all text-[var(--fg)]">{attestation.signature}</span>
              </div>
              <div>
                <span className="block font-medium text-[var(--fg-muted)]">Signed payload</span>
                <pre className="mt-1 max-h-32 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-surface-secondary)] p-2 text-[10px] text-[var(--fg)]">
                  {attestation.signedPayload}
                </pre>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-[var(--fg-muted)]">
              Response signed with mnemonic-derived key. Verify by recovering the signer from the signature.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
