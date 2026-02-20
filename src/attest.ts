/**
 * Mnemonic-based attestation for API responses.
 * Uses MNEMONIC from env (injected by Eigen KMS at deploy time; use any mnemonic for local testing).
 */

import { createHash } from "node:crypto";
import { mnemonicToAccount } from "viem/accounts";

export interface Attestation {
  signerAddress: string;
  signedPayload: string;
  contentHash: string;
  signature: string;
  timestamp: string;
}

function getAccount() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic || typeof mnemonic !== "string") return null;
  try {
    return mnemonicToAccount(mnemonic.trim() as ` ${string}`);
  } catch {
    return null;
  }
}

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Attest a response by signing a canonical payload.
 * Returns attestation object or null if mnemonic not configured.
 */
export async function attestResponse(
  type: "analysis" | "chat",
  params: { image: string; digest?: string; content: string }
): Promise<Attestation | null> {
  const account = getAccount();
  if (!account) return null;

  const timestamp = new Date().toISOString();
  const contentHash = sha256(params.content);
  const payload = JSON.stringify({
    type,
    image: params.image,
    digest: params.digest ?? null,
    contentHash,
    timestamp,
  });

  try {
    const signature = await account.signMessage({ message: payload });
    return {
      signerAddress: account.address,
      signedPayload: payload,
      contentHash,
      signature,
      timestamp,
    };
  } catch {
    return null;
  }
}
