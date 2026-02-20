/**
 * Docker Registry API types
 * Based on OCI Distribution Spec and Docker Manifest v2 Schema 2
 */

export interface LayerDescriptor {
  mediaType: string;
  digest: string;
  size: number;
  urls?: string[];
}

export interface ImageManifestV2 {
  schemaVersion: 2;
  mediaType: string;
  config: {
    mediaType: string;
    digest: string;
    size: number;
  };
  layers: LayerDescriptor[];
}

export interface ManifestListEntry {
  mediaType: string;
  digest: string;
  size: number;
  platform: {
    architecture: string;
    os: string;
    "os.version"?: string;
    "os.features"?: string[];
    variant?: string;
    features?: string[];
  };
}

export interface ManifestList {
  schemaVersion: 2;
  mediaType: string;
  manifests: ManifestListEntry[];
}

export type Manifest = ImageManifestV2 | ManifestList;

export function isManifestList(manifest: Manifest): manifest is ManifestList {
  return "manifests" in manifest && Array.isArray((manifest as ManifestList).manifests);
}

export function isImageManifest(manifest: Manifest): manifest is ImageManifestV2 {
  return "layers" in manifest && Array.isArray((manifest as ImageManifestV2).layers);
}

export interface ParsedImageRef {
  registry: string;
  repository: string;
  tag: string;
  /** When set, use for manifest fetch instead of tag (e.g. sha256:hex) */
  digest?: string;
}

export interface ImageConfigHistory {
  created?: string;
  created_by?: string;
  comment?: string;
  empty_layer?: boolean;
}

export interface ImageConfig {
  config?: {
    Cmd?: string[];
    Entrypoint?: string[];
    Env?: string[];
    WorkingDir?: string;
  };
  Config?: {
    Cmd?: string[];
    Entrypoint?: string[];
    Env?: string[];
    WorkingDir?: string;
  };
  history?: ImageConfigHistory[];
}
