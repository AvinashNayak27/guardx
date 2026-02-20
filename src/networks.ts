/**
 * Network configuration for Eigen Compute contracts.
 * Multi-network ready - add entries for mainnet, Holesky, etc.
 */

export interface NetworkConfig {
  chainId: number;
  appControllerAddress: `0x${string}`;
  rpcUrl: string;
}

function getRpcUrl(networkKey: string): string {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (apiKey) {
    if (networkKey === "sepolia") {
      return `https://eth-sepolia.g.alchemy.com/v2/${apiKey}`;
    }
    if (networkKey === "mainnet") {
      return `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;
    }
  }
  if (networkKey === "sepolia") {
    return process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";
  }
  if (networkKey === "mainnet") {
    return process.env.MAINNET_RPC_URL ?? "https://eth.llamarpc.com";
  }
  return "https://eth.llamarpc.com";
}

export const networks: Record<string, NetworkConfig> = {
  sepolia: {
    chainId: 11155111,
    appControllerAddress: "0x0dd810a6ffba6a9820a10d97b659f07d8d23d4e2" as `0x${string}`,
    rpcUrl: getRpcUrl("sepolia"),
  },
  mainnet: {
    chainId: 1,
    appControllerAddress: "0xc38d35fc995e75342a21cbd6d770305b142fbe67" as `0x${string}`,
    rpcUrl: getRpcUrl("mainnet"),
  },
};

export const APP_CONTROLLER_ABI = [
  {
    inputs: [{ internalType: "contract IApp", name: "app", type: "address" }],
    name: "getAppOperatorSetId",
    outputs: [{ internalType: "uint32", name: "", type: "uint32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "releaseManager",
    outputs: [{ internalType: "contract IReleaseManager", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "computeAVSRegistrar",
    outputs: [{ internalType: "contract IComputeAVSRegistrar", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const RELEASE_MANAGER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "avs", type: "address" },
          { internalType: "uint32", name: "id", type: "uint32" },
        ],
        internalType: "struct OperatorSet",
        name: "operatorSet",
        type: "tuple",
      },
    ],
    name: "getLatestRelease",
    outputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      {
        components: [
          {
            components: [
              { internalType: "bytes32", name: "digest", type: "bytes32" },
              { internalType: "string", name: "registry", type: "string" },
            ],
            internalType: "struct IReleaseManagerTypes.Artifact[]",
            name: "artifacts",
            type: "tuple[]",
          },
          { internalType: "uint32", name: "upgradeByTime", type: "uint32" },
        ],
        internalType: "struct IReleaseManagerTypes.Release",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export function getNetwork(networkKey: string): NetworkConfig | null {
  const key = networkKey.toLowerCase();
  const config = networks[key];
  if (!config) return null;
  // Resolve RPC URL at read time (ALCHEMY_API_KEY may be set lazily)
  return { ...config, rpcUrl: getRpcUrl(key) };
}
