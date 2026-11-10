import BN from "bn.js";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type {
  SignerWalletAdapter,
  WalletAdapter,
} from "@solana/wallet-adapter-base";
import {
  deriveStakeEntryPDA,
  type SolanaStakingClient,
} from "@streamflow/staking";
import { PRIORITY_FEE_MICRO_LAMPORTS } from "../config";
import { ZERO } from "../format";
import type { PoolSnapshot, UserEntrySnapshot } from "./reads";

export interface AtaPlan {
  ixs: TransactionInstruction[];
  rentLamports: number;
  missing: number;
}

export interface TxPreview {
  feeLamports: number | null;
  ataRentLamports: number;
  error: string | null;
  logs: string[];
}

export interface PreparedAction {
  ixs: TransactionInstruction[];
  ataRentLamports: number;
}

function asSignerAdapter(adapter: WalletAdapter | null): SignerWalletAdapter {
  if (!adapter || !adapter.publicKey) {
    throw new Error("WALLET_NOT_CONNECTED");
  }
  const signer = adapter as SignerWalletAdapter;
  if (typeof signer.signTransaction !== "function") {
    throw new Error("WALLET_CANNOT_SIGN_TRANSACTIONS");
  }
  return signer;
}

async function planMissingAtas(
  connection: Connection,
  payer: PublicKey,
  mints: Array<{ mint: PublicKey; owner: PublicKey }>,
  tokenProgramId: PublicKey,
): Promise<AtaPlan> {
  const unique = new Map<string, { mint: PublicKey; owner: PublicKey; ata: PublicKey }>();
  for (const item of mints) {
    const ata = getAssociatedTokenAddressSync(
      item.mint,
      item.owner,
      true,
      tokenProgramId,
    );
    unique.set(ata.toBase58(), { ...item, ata });
  }

  const entries = Array.from(unique.values());
  const infos = await Promise.all(
    entries.map((entry) => connection.getAccountInfo(entry.ata, "confirmed")),
  );
  const missing = entries.filter((_, index) => !infos[index]);
  if (!missing.length) {
    return { ixs: [], rentLamports: 0, missing: 0 };
  }

  const rentPerAccount = await connection.getMinimumBalanceForRentExemption(165, "confirmed");
  const ixs = missing.map((entry) =>
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      entry.ata,
      entry.owner,
      entry.mint,
      tokenProgramId,
    ),
  );

  return {
    ixs,
    rentLamports: rentPerAccount * missing.length,
    missing: missing.length,
  };
}

export async function findFreeStakeNonce(
  client: SolanaStakingClient,
  connection: Connection,
  stakePool: PublicKey,
  wallet: PublicKey,
): Promise<number> {
  const existing = await client.searchStakeEntries({ payer: wallet, stakePool });
  const used = new Set(existing.map((entry) => entry.account.nonce));
  const programId = client.getCurrentProgramId("stakePoolProgram");

  for (let nonce = 0; nonce < 255; nonce += 1) {
    if (used.has(nonce)) continue;
    const pda = deriveStakeEntryPDA(programId, stakePool, wallet, nonce);
    const info = await connection.getAccountInfo(pda, "confirmed");
    if (!info) return nonce;
  }

  throw new Error("NO_FREE_STAKE_ENTRY_NONCE");
}

function rewardPoolsArg(poolSnapshot: PoolSnapshot) {
  if (!poolSnapshot.rewardPool) {
    throw new Error("REWARD_POOL_NOT_CONFIGURED");
  }
  return [
    {
      nonce: poolSnapshot.rewardPool.account.nonce,
      mint: poolSnapshot.rewardPool.account.mint,
      rewardPoolType: "fixed" as const,
    },
  ];
}

export async function prepareStakeAction(params: {
  client: SolanaStakingClient;
  connection: Connection;
  poolSnapshot: PoolSnapshot;
  wallet: PublicKey;
  adapter: WalletAdapter | null;
  amount: BN;
  duration: BN;
  nonce: number;
}): Promise<PreparedAction> {
  const { client, connection, poolSnapshot, wallet, amount, duration, nonce } = params;
  const adapter = asSignerAdapter(params.adapter);
  const tokenMint = new PublicKey(poolSnapshot.pool.mint);
  const stakeMint = new PublicKey(poolSnapshot.pool.stakeMint);
  const tokenProgramId = new PublicKey(poolSnapshot.tokenMeta.tokenProgramId);
  const rewardPool = poolSnapshot.rewardPool;

  if (!rewardPool) throw new Error("REWARD_POOL_NOT_CONFIGURED");

  const ataPlan = await planMissingAtas(
    connection,
    wallet,
    [
      { mint: tokenMint, owner: wallet },
      { mint: stakeMint, owner: wallet },
      { mint: rewardPool.account.mint, owner: wallet },
    ],
    tokenProgramId,
  );

  const { ixs } = await client.prepareStakeAndCreateEntriesInstructions(
    {
      nonce,
      amount,
      duration,
      stakePool: new PublicKey(poolSnapshot.poolAddress),
      stakePoolMint: tokenMint,
      tokenProgramId,
      rewardPools: rewardPoolsArg(poolSnapshot),
    },
    {
      invoker: adapter,
      authority: wallet,
    } as never,
  );

  return {
    ixs: [...ataPlan.ixs, ...ixs],
    ataRentLamports: ataPlan.rentLamports,
  };
}

export async function prepareClaimAction(params: {
  client: SolanaStakingClient;
  connection: Connection;
  poolSnapshot: PoolSnapshot;
  wallet: PublicKey;
  adapter: WalletAdapter | null;
  entry: UserEntrySnapshot;
}): Promise<PreparedAction> {
  const { client, connection, poolSnapshot, wallet, entry } = params;
  const adapter = asSignerAdapter(params.adapter);
  const rewardPool = poolSnapshot.rewardPool;
  if (!rewardPool) throw new Error("REWARD_POOL_NOT_CONFIGURED");
  if (!entry.pendingRewards.gt(ZERO)) throw new Error("NO_CLAIMABLE_REWARDS");

  const tokenProgramId = new PublicKey(poolSnapshot.tokenMeta.tokenProgramId);
  const ataPlan = await planMissingAtas(
    connection,
    wallet,
    [{ mint: rewardPool.account.mint, owner: wallet }],
    tokenProgramId,
  );

  const { ixs } = await client.prepareClaimRewardsInstructions(
    {
      rewardPoolNonce: rewardPool.account.nonce,
      depositNonce: entry.nonce,
      stakePool: new PublicKey(poolSnapshot.poolAddress),
      stakePoolMint: new PublicKey(poolSnapshot.pool.mint),
      tokenProgramId,
      rewardMint: rewardPool.account.mint,
      rewardPoolType: "fixed",
    },
    { invoker: adapter } as never,
  );

  return {
    ixs: [...ataPlan.ixs, ...ixs],
    ataRentLamports: ataPlan.rentLamports,
  };
}

export async function prepareUnstakeAction(params: {
  client: SolanaStakingClient;
  connection: Connection;
  poolSnapshot: PoolSnapshot;
  wallet: PublicKey;
  adapter: WalletAdapter | null;
  entry: UserEntrySnapshot;
  mode: "claim" | "emergency";
}): Promise<PreparedAction> {
  const { client, connection, poolSnapshot, wallet, entry, mode } = params;
  const adapter = asSignerAdapter(params.adapter);
  const tokenMint = new PublicKey(poolSnapshot.pool.mint);
  const tokenProgramId = new PublicKey(poolSnapshot.tokenMeta.tokenProgramId);
  const base = {
    stakePool: new PublicKey(poolSnapshot.poolAddress),
    stakePoolMint: tokenMint,
    nonce: entry.nonce,
    tokenProgramId,
  };

  const mints = [{ mint: tokenMint, owner: wallet }];
  if (mode === "claim" && poolSnapshot.rewardPool) {
    mints.push({ mint: poolSnapshot.rewardPool.account.mint, owner: wallet });
  }

  const ataPlan = await planMissingAtas(
    connection,
    wallet,
    mints,
    tokenProgramId,
  );

  const { ixs } =
    mode === "claim"
      ? await client.prepareUnstakeAndClaimInstructions(
          {
            ...base,
            rewardPools: rewardPoolsArg(poolSnapshot),
          },
          { invoker: adapter } as never,
        )
      : await client.prepareUnstakeAndCloseInstructions(
          {
            ...base,
            rewardPools: rewardPoolsArg(poolSnapshot),
          },
          { invoker: adapter } as never,
        );

  return {
    ixs: [...ataPlan.ixs, ...ixs],
    ataRentLamports: ataPlan.rentLamports,
  };
}

export async function previewInstructions(
  connection: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  ataRentLamports: number,
): Promise<TxPreview> {
  try {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = payer;
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    const fee = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
    // The legacy Transaction overload simulates without signature verification
    // and refreshes the blockhash internally.
    const simulation = await connection.simulateTransaction(tx);

    return {
      feeLamports: fee.value,
      ataRentLamports,
      error: simulation.value.err ? formatSimulationError(simulation.value.err, simulation.value.logs) : null,
      logs: simulation.value.logs ?? [],
    };
  } catch (error) {
    return {
      feeLamports: null,
      ataRentLamports,
      error: describeError(error),
      logs: [],
    };
  }
}

export async function executeInstructions(
  client: SolanaStakingClient,
  ixs: TransactionInstruction[],
  adapter: WalletAdapter | null,
): Promise<string> {
  const signer = asSignerAdapter(adapter);
  const { signature } = await client.execute(ixs, {
    invoker: signer as never,
    computePrice: PRIORITY_FEE_MICRO_LAMPORTS,
    computeLimit: "autoSimulate",
  });
  await waitForConfirmation(client.connection, signature);
  return signature;
}

export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs = 90_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    if (status.value?.err) {
      throw new Error(
        `TRANSACTION_FAILED:${signature}:${JSON.stringify(status.value.err)}`,
      );
    }
    if (
      status.value?.confirmationStatus === "confirmed" ||
      status.value?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  throw new Error(`CONFIRMATION_TIMEOUT:${signature}`);
}

export function formatSimulationError(
  err: unknown,
  logs: string[] | null | undefined,
): string {
  const tail = (logs ?? []).slice(-6).join("\n");
  const raw = typeof err === "string" ? err : JSON.stringify(err);
  return `SIMULATION FAILED: ${raw}${tail ? `\n${tail}` : ""}`;
}

export function describeError(error: unknown): string {
  if (!error) return "UNKNOWN ERROR";
  if (typeof error === "string") return error;

  const candidate = error as {
    message?: string;
    error?: { errorMessage?: string; errorCode?: { code?: string; number?: number } };
    logs?: string[];
  };

  if (candidate.error?.errorMessage) {
    return `${candidate.error.errorMessage}${
      candidate.error.errorCode?.code ? ` (${candidate.error.errorCode.code})` : ""
    }`;
  }
  let message = candidate.message ?? "UNKNOWN ERROR";
  message = message
    .replace("WALLET_NOT_CONNECTED", "CONNECT A WALLET FIRST")
    .replace("WALLET_CANNOT_SIGN_TRANSACTIONS", "THIS WALLET CANNOT SIGN TRANSACTIONS")
    .replace("REWARD_POOL_NOT_CONFIGURED", "NO REWARD POOL IS CONFIGURED")
    .replace("NO_CLAIMABLE_REWARDS", "NO CLAIMABLE REWARDS")
    .replace("NO_FREE_STAKE_ENTRY_NONCE", "NO FREE STAKE POSITION SLOT");

  const logs = candidate.logs?.slice(-4).join("\n");
  return logs ? `${message}\n${logs}` : message;
}
