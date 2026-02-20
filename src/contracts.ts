/**
 * Eigen Compute contract interactions - resolve app to Docker image ref.
 */

import { createPublicClient, getContract, http, type Address } from "viem";
import { mainnet, sepolia } from "viem/chains";
import {
  getNetwork,
  APP_CONTROLLER_ABI,
  RELEASE_MANAGER_ABI,
} from "./networks.js";

export interface ResolvedImage {
  imageRef: string;
  registry: string;
  digest: string;
}

/**
 * Resolve an Eigen Compute app address to its deployed Docker image reference.
 * Queries AppController -> getAppOperatorSetId, releaseManager, computeAVSRegistrar;
 * then ReleaseManager.getLatestRelease(operatorSet) to get artifacts (registry, digest).
 */
export async function resolveAppToImageRef(
  networkKey: string,
  appId: string
): Promise<ResolvedImage | { error: string }> {
  const config = getNetwork(networkKey);
  if (!config) {
    return { error: `Unknown network: ${networkKey}` };
  }

  const chain =
    networkKey.toLowerCase() === "sepolia"
      ? sepolia
      : networkKey.toLowerCase() === "mainnet"
        ? mainnet
        : undefined;
  if (!chain) {
    return { error: `Chain not configured for network: ${networkKey}` };
  }

  const client = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  const appController = getContract({
    address: config.appControllerAddress,
    abi: APP_CONTROLLER_ABI,
    client,
  });

  try {
    const [operatorSetId, releaseManagerAddr, computeAVSRegistrarAddr] =
      await Promise.all([
        appController.read.getAppOperatorSetId([appId as Address]),
        appController.read.releaseManager(),
        appController.read.computeAVSRegistrar(),
      ]);

    // OperatorSet: { avs, id } - use computeAVSRegistrar as avs
    const operatorSet = {
      avs: computeAVSRegistrarAddr,
      id: operatorSetId,
    };

    const releaseManager = getContract({
      address: releaseManagerAddr,
      abi: RELEASE_MANAGER_ABI,
      client,
    });

    const [, release] = await releaseManager.read.getLatestRelease([operatorSet]);

    const artifacts = release.artifacts;
    if (!artifacts || artifacts.length === 0) {
      return { error: "No artifacts in release" };
    }

    const artifact = artifacts[0];
    const registryStr = artifact.registry;
    const digestBytes32 = artifact.digest;

    // bytes32 to sha256:hex (strip 0x)
    const digestHex = digestBytes32.replace(/^0x/, "");
    const digest = `sha256:${digestHex}`;

    // registry is e.g. "docker.io/wallexyz/backtest"
    const imageRef = `${registryStr}@${digest}`;

    return {
      imageRef,
      registry: registryStr,
      digest,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Contract call failed: ${message}` };
  }
}
