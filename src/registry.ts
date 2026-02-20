/**
 * Docker Registry API v2 client for fetching image manifests
 */

import type {
  ImageManifestV2,
  Manifest,
  ManifestList,
  ParsedImageRef,
} from "./types.js";
import {
  isImageManifest,
  isManifestList,
} from "./types.js";

const DOCKER_HUB_REGISTRY = "registry-1.docker.io";
/** docker.io in refs maps to registry-1.docker.io for API calls */
const DOCKER_IO_ALIAS = "docker.io";
const MANIFEST_LIST_MEDIA_TYPE = "application/vnd.docker.distribution.manifest.list.v2+json";
const IMAGE_MANIFEST_MEDIA_TYPE = "application/vnd.docker.distribution.manifest.v2+json";

/**
 * Normalize registry host for API calls. docker.io -> registry-1.docker.io.
 */
function normalizeRegistry(registry: string): string {
  if (registry === DOCKER_IO_ALIAS) {
    return DOCKER_HUB_REGISTRY;
  }
  return registry;
}

/**
 * Parse an image reference like "ubuntu", "ubuntu:22.04", "owner/image@sha256:hex"
 * into registry, repository, tag, and optional digest.
 */
export function parseImageRef(imageRef: string): ParsedImageRef {
  let registry = DOCKER_HUB_REGISTRY;
  let repository: string;
  let tag = "latest";
  let digest: string | undefined;

  // Check for explicit registry (e.g., registry.example.com/org/repo:tag)
  const parts = imageRef.split("/");
  if (parts.length >= 2 && (parts[0].includes(".") || parts[0].includes(":"))) {
    registry = parts[0];
    imageRef = parts.slice(1).join("/");
  }

  // Check for digest (e.g., owner/image@sha256:hex) - takes precedence over tag
  const atIdx = imageRef.indexOf("@");
  if (atIdx > 0) {
    const afterAt = imageRef.slice(atIdx + 1);
    if (afterAt.startsWith("sha256:") && /^sha256:[a-fA-F0-9]{64}$/.test(afterAt)) {
      digest = afterAt;
      imageRef = imageRef.slice(0, atIdx);
    }
  }

  // Split tag (e.g., ubuntu:22.04 -> tag=22.04) - only if no digest
  if (!digest) {
    const colonIdx = imageRef.lastIndexOf(":");
    if (colonIdx > 0) {
      const possibleTag = imageRef.slice(colonIdx + 1);
      if (!possibleTag.includes("/")) {
        tag = possibleTag;
        imageRef = imageRef.slice(0, colonIdx);
      }
    }
  }

  // For Docker Hub: single component = library/<name>
  const effectiveRegistry =
    registry === DOCKER_IO_ALIAS ? DOCKER_HUB_REGISTRY : registry;
  if (effectiveRegistry === DOCKER_HUB_REGISTRY && !imageRef.includes("/")) {
    repository = `library/${imageRef}`;
  } else {
    repository = imageRef;
  }

  return {
    registry: normalizeRegistry(registry),
    repository,
    tag,
    digest,
  };
}

/**
 * Get the auth token for Docker Hub (handles anonymous and basic auth).
 * Docker Hub requires token auth for most operations.
 */
async function getDockerHubToken(
  repository: string,
  registry: string = DOCKER_HUB_REGISTRY
): Promise<string | null> {
  if (registry !== DOCKER_HUB_REGISTRY) {
    return null;
  }

  const authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;
  const res = await fetch(authUrl);

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { token?: string };
  return data.token ?? null;
}

/**
 * Fetch the manifest for an image, handling both manifest lists and image manifests.
 * Uses digest when present, otherwise tag.
 */
export async function fetchManifest(parsed: ParsedImageRef): Promise<Manifest> {
  const ref = parsed.digest ?? parsed.tag;
  const baseUrl = `https://${parsed.registry}/v2/${parsed.repository}/manifests/${ref}`;

  const token = await getDockerHubToken(parsed.repository, parsed.registry);
  const headers: Record<string, string> = {
    Accept: `${MANIFEST_LIST_MEDIA_TYPE}, ${IMAGE_MANIFEST_MEDIA_TYPE}`,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(baseUrl, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch manifest: ${res.status} ${res.statusText}. ${text}`
    );
  }

  const manifest = (await res.json()) as Manifest;
  return manifest;
}

/**
 * Resolve manifest to an image manifest (handles multi-arch manifest lists).
 * Prefers linux/amd64 platform.
 */
export async function resolveToImageManifest(
  parsed: ParsedImageRef
): Promise<ImageManifestV2> {
  const manifest = await fetchManifest(parsed);

  if (isImageManifest(manifest)) {
    return manifest;
  }

  if (isManifestList(manifest)) {
    const entry = selectManifestEntry(manifest);
    return fetchManifestByDigest(parsed, entry.digest);
  }

  throw new Error("Unknown manifest format received");
}

function selectManifestEntry(manifestList: ManifestList): {
  digest: string;
  platform: { os: string; architecture: string };
} {
  const manifests = manifestList.manifests;

  // Prefer linux/amd64
  const linuxAmd64 = manifests.find(
    (m) =>
      m.platform?.os === "linux" && m.platform?.architecture === "amd64"
  );
  if (linuxAmd64) {
    return {
      digest: linuxAmd64.digest,
      platform: {
        os: linuxAmd64.platform.os,
        architecture: linuxAmd64.platform.architecture,
      },
    };
  }

  // Fallback to first manifest
  const first = manifests[0];
  return {
    digest: first.digest,
    platform: {
      os: first.platform?.os ?? "unknown",
      architecture: first.platform?.architecture ?? "unknown",
    },
  };
}

async function fetchManifestByDigest(
  parsed: ParsedImageRef,
  digest: string
): Promise<ImageManifestV2> {
  const baseUrl = `https://${parsed.registry}/v2/${parsed.repository}/manifests/${digest}`;

  const token = await getDockerHubToken(parsed.repository, parsed.registry);
  const headers: Record<string, string> = {
    Accept: IMAGE_MANIFEST_MEDIA_TYPE,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(baseUrl, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch image manifest: ${res.status} ${res.statusText}. ${text}`
    );
  }

  return (await res.json()) as ImageManifestV2;
}

/**
 * Fetch a layer blob from the registry by digest.
 * Returns the raw blob bytes (gzipped tar).
 */
export async function fetchLayerBlob(
  parsed: ParsedImageRef,
  digest: string
): Promise<ArrayBuffer> {
  const blobUrl = `https://${parsed.registry}/v2/${parsed.repository}/blobs/${digest}`;

  const token = await getDockerHubToken(parsed.repository, parsed.registry);
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(blobUrl, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch layer blob: ${res.status} ${res.statusText}. ${text}`
    );
  }

  return res.arrayBuffer();
}

