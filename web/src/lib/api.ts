const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface ReleaseInfo {
  appId: string;
  rmsReleaseId: string;
  imageDigest: string;
  registryUrl: string;
  createdAt: string;
}

export interface ReleaseChangeLog {
  hasPreviousRelease: boolean;
  imageDigestChanged: boolean;
  registryUrlChanged: boolean;
  publicEnvChanged: boolean;
  latestCreatedAt: string;
  previousCreatedAt: string | null;
  summary: string[];
}

export interface AnalysisMetadata {
  timestamp?: string;
  exploreDigest?: string | null;
  resolvedImageRef?: string;
  resolverSource?: "api" | "chain";
  latestRelease?: ReleaseInfo | null;
  previousRelease?: ReleaseInfo | null;
  releaseChangeLog?: ReleaseChangeLog | null;
  [key: string]: unknown;
}

export interface AnalysisByAppResponse {
  analysis: Record<string, unknown>;
  image: string;
  rawResponse?: string;
  metadata?: AnalysisMetadata;
  [key: string]: unknown;
}

export type AnalysisJobResponse =
  | AnalysisByAppResponse
  | {
      status: "idle" | "running" | "failed";
      error?: string;
      metadata?: AnalysisMetadata;
    };

/** Hostname -> network key mapping for Eigen Verify links */
const HOST_TO_NETWORK: Record<string, string> = {
  "verify-sepolia.eigencloud.xyz": "sepolia",
  "verify.eigencloud.xyz": "mainnet",
};

/**
 * Parse an Eigen Verify link to extract app ID and network.
 * Example: https://verify-sepolia.eigencloud.xyz/app/0x954450e70556b56300aba48674f97adaaa8c463c
 */
export function parseEigenVerifyLink(
  link: string
): { appId: string; network: string } | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const network = HOST_TO_NETWORK[url.hostname];
    if (!network) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const appId = segments[segments.length - 1];
    if (!appId || !/^0x[a-fA-F0-9]{40}$/.test(appId)) return null;
    return { appId, network };
  } catch {
    return null;
  }
}

export async function getContents(owner: string, image: string, tag = "latest") {
  const res = await fetch(
    `${API_BASE}/contents/${owner}/${image}?tag=${encodeURIComponent(tag)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export async function getAnalysis(owner: string, image: string, tag = "latest") {
  const res = await fetch(
    `${API_BASE}/analysis/${owner}/${image}?tag=${encodeURIComponent(tag)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export async function postChat(
  owner: string,
  image: string,
  message: string,
  history: { role: string; content: string }[] = [],
  tag = "latest"
) {
  const res = await fetch(
    `${API_BASE}/chat/${owner}/${image}?tag=${encodeURIComponent(tag)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export async function getAnalysisByApp(network: string, appId: string) {
  return getLatestAnalysisByApp(network, appId);
}

export async function getLatestAnalysisByApp(
  network: string,
  appId: string
): Promise<AnalysisJobResponse> {
  const res = await fetch(
    `${API_BASE}/analysis/by-app/${encodeURIComponent(network)}/${encodeURIComponent(appId)}/latest`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export async function refreshAnalysisByApp(
  network: string,
  appId: string
): Promise<AnalysisJobResponse> {
  const res = await fetch(
    `${API_BASE}/analysis/by-app/${encodeURIComponent(network)}/${encodeURIComponent(appId)}/refresh`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export function isAnalysisReport(
  response: AnalysisJobResponse
): response is AnalysisByAppResponse {
  return "analysis" in response;
}

export async function postChatByApp(
  network: string,
  appId: string,
  message: string,
  history: { role: string; content: string }[] = []
) {
  const res = await fetch(
    `${API_BASE}/chat/by-app/${encodeURIComponent(network)}/${encodeURIComponent(appId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export function parseImageRef(input: string): { owner: string; image: string; tag: string } {
  const trimmed = input.trim();
  const tagIdx = trimmed.lastIndexOf(":");
  let rest = trimmed;
  let tag = "latest";
  if (tagIdx > 0 && !trimmed.slice(tagIdx + 1).includes("/")) {
    tag = trimmed.slice(tagIdx + 1);
    rest = trimmed.slice(0, tagIdx);
  }
  const parts = rest.split("/");
  if (parts.length < 2) {
    throw new Error('Use format "owner/image" or "owner/image:tag"');
  }
  const owner = parts[0];
  const image = parts.slice(1).join("/");
  return { owner, image, tag };
}
