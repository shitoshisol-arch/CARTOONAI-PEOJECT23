/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_CLUSTER?: string;
  readonly VITE_SOLANA_RPC_URL?: string;
  readonly VITE_TOKEN_MINT?: string;
  readonly VITE_TOKEN_SYMBOL?: string;
  readonly VITE_TOKEN_DECIMALS?: string;
  readonly VITE_STAKE_POOL?: string;
  readonly VITE_REWARD_POOL?: string;
  readonly VITE_REWARD_POOL_TYPE?: string;
  readonly VITE_STAKE_DURATION_DAYS?: string;
  readonly VITE_TARGET_APY?: string;
  readonly VITE_STAKE_CAP?: string;
  readonly VITE_REWARD_ALLOCATION?: string;
  readonly VITE_MAINNET_WRITES?: string;
  readonly VITE_PRIORITY_FEE_MICRO_LAMPORTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
