/**
 * Layer extraction and logging utilities
 */

import type { ImageManifestV2, LayerDescriptor } from "./types.js";

export interface LayerInfo {
  index: number;
  digest: string;
  size: number;
  sizeFormatted: string;
  mediaType: string;
  createdBy?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function extractLayers(manifest: ImageManifestV2): LayerInfo[] {
  return manifest.layers.map((layer: LayerDescriptor, index: number) => ({
    index: index + 1,
    digest: layer.digest,
    size: layer.size,
    sizeFormatted: formatBytes(layer.size),
    mediaType: layer.mediaType,
  }));
}

export function logLayers(
  imageRef: string,
  layers: LayerInfo[],
  options: { json?: boolean; filter?: string } = {}
): void {
  const filtered =
    options.filter && options.filter.length > 0
      ? layers.filter((l) =>
          (l.createdBy ?? "").toLowerCase().includes(options.filter!.toLowerCase())
        )
      : layers;

  if (options.json) {
    console.log(
      JSON.stringify(
        { image: imageRef, layerCount: filtered.length, layers: filtered },
        null,
        2
      )
    );
    return;
  }

  if (filtered.length === 0) {
    console.log(
      `\n📦 Docker Image: ${imageRef}\n   No layers match "${options.filter}".\n`
    );
    return;
  }

  console.log(`\n📦 Docker Image: ${imageRef}`);
  if (options.filter) {
    console.log(`   Layers matching "${options.filter}" (${filtered.length} of ${layers.length}):\n`);
  } else {
    console.log(`   Layers: ${layers.length}\n`);
  }

  let totalSize = 0;
  filtered.forEach((layer) => {
    totalSize += layer.size;
    console.log(`   Layer ${layer.index}:`);
    console.log(`      Digest: ${layer.digest}`);
    console.log(`      Size:  ${layer.sizeFormatted}`);
    if (layer.createdBy) {
      console.log(`      Created by: ${layer.createdBy}`);
    }
    console.log(`      Type:  ${layer.mediaType}`);
    console.log("");
  });

  console.log(`   Total size: ${formatBytes(totalSize)}\n`);
}
