import { PublicKey, clusterApiUrl } from "@solana/web3.js";
import { ICluster } from "@streamflow/common";

export type AppCluster = "devnet" | "mainnet-beta";

function readCluster(): AppCluster {
  const raw = (import.meta.env.VITE_SOLANA_CLUSTER ?? "devnet").trim().toLowerCase();
  if (raw === "mainnet" || raw === "mainnet-beta") return "mainnet-beta";
  return "devnet";
}

export const CLUSTER: AppCluster = readCluster();
export const IS_MAINNET = CLUSTER === "mainnet-beta";
export const CLUSTER_LABEL = IS_MAINNET ? "MAINNET" : "DEVNET";

export const RPC_ENDPOINT =
  import.meta.env.VITE_SOLANA_RPC_URL?.trim() ||
  clusterApiUrl(CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet");

export const STREAMFLOW_CLUSTER = IS_MAINNET ? ICluster.Mainnet : ICluster.Devnet;

/**
 * Streamflow program IDs published in the official @streamflow/staking docs.
 * https://js-sdk-docs.streamflow.finance/modules/_streamflow_staking.html
 *
 * These are identical on Mainnet and Devnet per the official documentation.
 */
export const STREAMFLOW_PROGRAM_IDS = {
  stakePool: "STAKEvGqQTtzJZH6BWDcbpzXXn2BBerPAgQ3EGLN2GH",
  rewardPoolFixed: "RWRDdfRbi3339VgKxTAXg4cjyniF7cbhNbMxZWiSKmj",
  rewardPoolDynamic: "RWRDyfZa6Rk9UYi85yjYYfGmoUqffLqjo6vZdFawEez",
} as const;

export const STREAMFLOW_DOCS = {
  sdk: "https://js-sdk-docs.streamflow.finance/modules/_streamflow_staking.html",
  developers: "https://developers.streamflow.finance/",
  security: "https://docs.streamflow.finance/en/articles/9869371-security",
  audits: "https://docs.streamflow.finance/en/articles/9338573-has-streamflow-been-audited",
};

function envString(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  return typeof value === "string" ? value.trim() : "";
}

function envNumber(name: string, fallback: number): number {
  const raw = envString(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envBool(name: string, fallback = false): boolean {
  const raw = envString(name).toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function parsePublicKey(value: string): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

const mintRaw = envString("VITE_TOKEN_MINT");
const stakePoolRaw = envString("VITE_STAKE_POOL");
const rewardPoolRaw = envString("VITE_REWARD_POOL");

export const TOKEN_MINT = parsePublicKey(mintRaw);
export const STAKE_POOL_ADDRESS = parsePublicKey(stakePoolRaw);
export const REWARD_POOL_ADDRESS = parsePublicKey(rewardPoolRaw);

export const TOKEN_SYMBOL = envString("VITE_TOKEN_SYMBOL") || "F106";
export const TOKEN_DECIMALS = Math.min(
  18,
  Math.max(0, Math.floor(envNumber("VITE_TOKEN_DECIMALS", 8))),
);

const rewardPoolTypeRaw = envString("VITE_REWARD_POOL_TYPE").toLowerCase();
export const REWARD_POOL_TYPE: "fixed" | "dynamic" =
  rewardPoolTypeRaw === "dynamic" ? "dynamic" : "fixed";

/** The SDK's SolanaStakingClient currently searches the fixed reward program. */
export const REWARD_POOL_PROGRAM_SUPPORTED = REWARD_POOL_TYPE === "fixed";

export const TARGET_APY = envNumber("VITE_TARGET_APY", 19);
export const STAKE_DURATION_DAYS = Math.max(1, envNumber("VITE_STAKE_DURATION_DAYS", 182));
export const MAX_STAKE_CAP = Math.max(0, envNumber("VITE_STAKE_CAP", 90));
export const MAX_REWARD_ALLOCATION = Math.max(0, envNumber("VITE_REWARD_ALLOCATION", 10));

export const PRIORITY_FEE_MICRO_LAMPORTS = Math.max(
  0,
  Math.floor(envNumber("VITE_PRIORITY_FEE_MICRO_LAMPORTS", 20_000)),
);

export const MAINNET_WRITES_ENABLED = envBool("VITE_MAINNET_WRITES", false);

export const CONFIG_MISSING: string[] = [];
if (!TOKEN_MINT) CONFIG_MISSING.push("VITE_TOKEN_MINT");
if (!STAKE_POOL_ADDRESS) CONFIG_MISSING.push("VITE_STAKE_POOL");
if (REWARD_POOL_TYPE === "dynamic") CONFIG_MISSING.push("fixed reward pool (dynamic is not wired)");

export const CONFIG_READY = CONFIG_MISSING.length === 0 && REWARD_POOL_PROGRAM_SUPPORTED;

export const WRITE_ENABLED =
  CONFIG_READY && (!IS_MAINNET || MAINNET_WRITES_ENABLED);

export function writeLockReason(): string | null {
  if (!CONFIG_READY) return "ON-CHAIN POOL NOT CONFIGURED";
  if (IS_MAINNET && !MAINNET_WRITES_ENABLED) {
    return "MAINNET WRITES LOCKED — EXPLICIT APPROVAL REQUIRED";
  }
  return null;
}

export function explorerTxUrl(signature: string): string {
  const suffix = IS_MAINNET ? "" : "?cluster=devnet";
  return `https://solscan.io/tx/${signature}${suffix}`;
}

export function explorerAddressUrl(address: string): string {
  const suffix = IS_MAINNET ? "" : "?cluster=devnet";
  return `https://solscan.io/account/${address}${suffix}`;
}

export const APP = {
  name: "CHILL106",
  file: "FILE106",
  route: "/staking",
  adminRoute: "/staking/admin",
  repo: "https://github.com/html-crm/CARTOONAI-PEOJECT23",
  site: "https://chillguyrich.fun/",
} as const;
