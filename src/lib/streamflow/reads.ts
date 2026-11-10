import BN from "bn.js";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  calcRewards,
  type RewardEntry,
  type RewardPool,
  type SolanaStakingClient,
  type StakeEntry,
  type StakePool,
} from "@streamflow/staking";
import { impliedApr } from "../economics";
import { ZERO, nowSeconds } from "../format";
import {
  MAX_STAKE_CAP,
  REWARD_POOL_ADDRESS,
  REWARD_POOL_TYPE,
  STAKE_POOL_ADDRESS,
  TOKEN_DECIMALS,
  TOKEN_MINT,
  TOKEN_SYMBOL,
  type AppCluster,
} from "../config";
import { getProtocolProgramIds, type ProgramIdSnapshot } from "./client";

type AccountLike<T> = { publicKey: PublicKey; account: T };

export class ValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ValidationError";
  }
}

export interface MintMeta {
  address: string;
  decimals: number;
  supply: BN;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  tokenProgramId: string;
}

export interface RewardPoolAccount {
  publicKey: PublicKey;
  account: RewardPool;
}

export type PoolStatus = "LIVE" | "FULL" | "EXPIRED" | "UNCONFIGURED";

export interface PoolSnapshot {
  cluster: AppCluster;
  poolAddress: string;
  pool: StakePool & { totalStake: BN; totalEffectiveStake: BN };
  tokenMeta: MintMeta;
  rewardPools: RewardPoolAccount[];
  rewardPool: RewardPoolAccount | null;
  rewardMintMeta: MintMeta | null;
  rewardReserve: BN;
  capacityTotal: BN;
  capacityRemaining: BN;
  capacityUsed: BN;
  status: PoolStatus;
  impliedApr: number;
  programs: ProgramIdSnapshot;
}

export type EntryStatus = "LOCKED" | "UNLOCKED" | "COMPLETED";

export interface UserEntrySnapshot {
  address: string;
  nonce: number;
  amount: BN;
  duration: BN;
  weight: BN;
  effectiveAmount: BN;
  createdAt: BN;
  closedAt: BN;
  unlockAt: number;
  status: EntryStatus;
  pendingRewards: BN;
  claimedRewards: BN;
  rewardEntryAddress: string | null;
}

export interface UserSnapshot {
  wallet: string;
  tokenBalance: BN;
  receiptBalance: BN;
  totalStaked: BN;
  pendingRewards: BN;
  activeEntries: UserEntrySnapshot[];
  entries: UserEntrySnapshot[];
}

export interface AdminSnapshot {
  pool: PoolSnapshot;
  totalDepositedEver: BN;
  totalStaked: BN;
  activePositions: number;
  unlockedPositions: number;
  completedPositions: number;
  uniqueWallets: number;
  rewardFunded: BN;
  rewardClaimed: BN;
  rewardReserve: BN;
}

function isSupportedTokenProgram(programId: PublicKey): boolean {
  return (
    programId.equals(TOKEN_PROGRAM_ID) ||
    programId.equals(TOKEN_2022_PROGRAM_ID)
  );
}

export async function loadMintMeta(
  connection: Connection,
  mintAddress: PublicKey,
  label = "TOKEN",
): Promise<MintMeta> {
  const accountInfo = await connection.getAccountInfo(mintAddress, "confirmed");
  if (!accountInfo) {
    throw new ValidationError(
      "MINT_NOT_FOUND",
      `${label} mint ${mintAddress.toBase58()} does not exist on this cluster.`,
    );
  }
  if (!isSupportedTokenProgram(accountInfo.owner)) {
    throw new ValidationError(
      "MINT_PROGRAM_UNSUPPORTED",
      `${label} mint is owned by ${accountInfo.owner.toBase58()}, which is not an SPL Token or Token-2022 program.`,
    );
  }
  const mint = await getMint(
    connection,
    mintAddress,
    "confirmed",
    accountInfo.owner,
  );
  return {
    address: mintAddress.toBase58(),
    decimals: mint.decimals,
    supply: new BN(mint.supply.toString()),
    mintAuthority: mint.mintAuthority?.toBase58() ?? null,
    freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
    tokenProgramId: accountInfo.owner.toBase58(),
  };
}

async function readTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgramId: PublicKey,
): Promise<BN> {
  try {
    const ata = getAssociatedTokenAddressSync(mint, owner, true, tokenProgramId);
    const balance = await connection.getTokenAccountBalance(ata, "confirmed");
    return new BN(balance.value.amount);
  } catch {
    return ZERO;
  }
}

async function readRewardReserve(
  connection: Connection,
  rewardPool: RewardPoolAccount | null,
): Promise<BN> {
  if (!rewardPool) return ZERO;
  try {
    const balance = await connection.getTokenAccountBalance(
      rewardPool.account.vault,
      "confirmed",
    );
    return new BN(balance.value.amount);
  } catch {
    return ZERO;
  }
}

export async function loadPoolSnapshot(
  client: SolanaStakingClient,
  connection: Connection,
  cluster: AppCluster,
  tokenMint: PublicKey = TOKEN_MINT as PublicKey,
  stakePoolAddress: PublicKey = STAKE_POOL_ADDRESS as PublicKey,
): Promise<PoolSnapshot> {
  if (!tokenMint || !stakePoolAddress) {
    throw new ValidationError(
      "CONFIG_MISSING",
      "Token mint and stake pool must both be configured.",
    );
  }

  const [pool, tokenMeta] = await Promise.all([
    client.getStakePool(stakePoolAddress),
    loadMintMeta(connection, tokenMint),
  ]);

  if (!pool.mint.equals(tokenMint)) {
    throw new ValidationError(
      "POOL_MINT_MISMATCH",
      `Configured mint ${tokenMint.toBase58()} does not match the stake pool mint ${pool.mint.toBase58()}. Writes are disabled.`,
    );
  }

  if (tokenMeta.decimals !== TOKEN_DECIMALS) {
    throw new ValidationError(
      "MINT_DECIMALS_MISMATCH",
      `On-chain mint ${tokenMint.toBase58()} has ${tokenMeta.decimals} decimals but the app is configured for ${TOKEN_DECIMALS}. Writes are disabled because every amount would be mis-scaled.`,
    );
  }

  if (REWARD_POOL_TYPE !== "fixed") {
    throw new ValidationError(
      "REWARD_POOL_TYPE_UNSUPPORTED",
      "The installed Streamflow SDK searches fixed reward pools. Dynamic reward pools are not exposed by searchRewardPools().",
    );
  }

  const allRewardPools = (await client.searchRewardPools({
    stakePool: stakePoolAddress,
  })) as RewardPoolAccount[];

  const matchingRewardPools = allRewardPools
    .filter((poolAccount) => poolAccount.account.stakePool.equals(stakePoolAddress))
    .filter((poolAccount) => poolAccount.account.mint.equals(tokenMint));

  const configuredRewardPool = REWARD_POOL_ADDRESS;
  let rewardPool: RewardPoolAccount | null = null;
  if (configuredRewardPool) {
    rewardPool =
      matchingRewardPools.find((candidate) =>
        candidate.publicKey.equals(configuredRewardPool),
      ) ?? null;
    if (!rewardPool) {
      throw new ValidationError(
        "REWARD_POOL_NOT_FOUND",
        `Configured reward pool ${configuredRewardPool.toBase58()} was not found for this stake pool and mint.`,
      );
    }
  } else {
    rewardPool = matchingRewardPools[0] ?? null;
  }

  const rewardMintMeta = rewardPool
    ? await loadMintMeta(connection, rewardPool.account.mint, "REWARD")
    : null;
  if (rewardMintMeta && rewardMintMeta.decimals !== TOKEN_DECIMALS) {
    throw new ValidationError(
      "REWARD_MINT_DECIMALS_MISMATCH",
      `Reward mint ${rewardMintMeta.address} has ${rewardMintMeta.decimals} decimals but the app is configured for ${TOKEN_DECIMALS}. Writes are disabled.`,
    );
  }
  const rewardReserve = await readRewardReserve(connection, rewardPool);

  const capacityTotal = new BN(
    Math.round(MAX_STAKE_CAP * 10 ** TOKEN_DECIMALS).toString(),
  );
  let capacityRemaining: BN;
  if (pool.isTotalStakeCapped) {
    capacityRemaining = new BN(pool.remainingTotalStake.toString());
  } else {
    capacityRemaining = BN.max(ZERO, capacityTotal.sub(new BN(pool.totalStake.toString())));
  }

  const now = nowSeconds();
  const expiry = pool.expiryTs.toNumber();
  let status: PoolStatus = "LIVE";
  if (expiry > 0 && now >= expiry) status = "EXPIRED";
  else if (pool.isTotalStakeCapped && capacityRemaining.isZero()) status = "FULL";
  else if (!pool.isTotalStakeCapped && capacityTotal.gt(ZERO) && capacityRemaining.isZero()) {
    status = "FULL";
  }

  return {
    cluster,
    poolAddress: stakePoolAddress.toBase58(),
    pool: pool as PoolSnapshot["pool"],
    tokenMeta,
    rewardPools: matchingRewardPools,
    rewardPool,
    rewardMintMeta,
    rewardReserve,
    capacityTotal,
    capacityRemaining,
    capacityUsed: BN.max(ZERO, capacityTotal.sub(capacityRemaining)),
    status,
    impliedApr: rewardPool
      ? impliedApr(rewardPool.account.rewardAmount, rewardPool.account.rewardPeriod)
      : 0,
    programs: getProtocolProgramIds(),
  };
}

export async function loadUserSnapshot(
  client: SolanaStakingClient,
  connection: Connection,
  poolSnapshot: PoolSnapshot,
  wallet: PublicKey,
): Promise<UserSnapshot> {
  const tokenMint = new PublicKey(poolSnapshot.pool.mint);
  const tokenProgramId = new PublicKey(poolSnapshot.tokenMeta.tokenProgramId);
  const stakeMint = new PublicKey(poolSnapshot.pool.stakeMint);
  const rewardPool = poolSnapshot.rewardPool;

  const [tokenBalance, receiptBalance, stakeEntries] = await Promise.all([
    readTokenBalance(connection, tokenMint, wallet, tokenProgramId),
    readTokenBalance(connection, stakeMint, wallet, tokenProgramId),
    client.searchStakeEntries({
      payer: wallet,
      stakePool: new PublicKey(poolSnapshot.poolAddress),
    }),
  ]);

  const entries: UserEntrySnapshot[] = [];
  const now = nowSeconds();

  for (const stakeEntry of stakeEntries as AccountLike<StakeEntry>[]) {
    let rewardEntry: AccountLike<RewardEntry> | undefined;
    if (rewardPool) {
      const matches = (await client.searchRewardEntries({
        rewardPool: rewardPool.publicKey,
        stakeEntry: stakeEntry.publicKey,
      })) as AccountLike<RewardEntry>[];
      rewardEntry = matches[0];
    }

    let pendingRewards = ZERO;
    if (rewardPool) {
      try {
        pendingRewards = calcRewards(
          rewardEntry as never,
          stakeEntry as never,
          rewardPool as never,
        );
      } catch {
        pendingRewards = ZERO;
      }
    }

    const createdAt = stakeEntry.account.createdTs;
    const duration = stakeEntry.account.duration;
    const closedAt = stakeEntry.account.closedTs;
    const closed = closedAt.gtn(0);
    const unlockAt = createdAt.toNumber() + duration.toNumber();
    const status: EntryStatus = closed
      ? "COMPLETED"
      : now >= unlockAt
        ? "UNLOCKED"
        : "LOCKED";

    entries.push({
      address: stakeEntry.publicKey.toBase58(),
      nonce: stakeEntry.account.nonce,
      amount: new BN(stakeEntry.account.amount.toString()),
      duration: new BN(duration.toString()),
      weight: new BN(0),
      effectiveAmount: new BN(stakeEntry.account.effectiveAmount.toString()),
      createdAt: new BN(createdAt.toString()),
      closedAt: new BN(closedAt.toString()),
      unlockAt,
      status,
      pendingRewards,
      claimedRewards: rewardEntry
        ? new BN(rewardEntry.account.claimedAmount.toString())
        : ZERO,
      rewardEntryAddress: rewardEntry?.publicKey.toBase58() ?? null,
    });
  }

  entries.sort((a, b) => b.createdAt.toNumber() - a.createdAt.toNumber());

  const activeEntries = entries.filter((entry) => entry.status !== "COMPLETED");
  const totalStaked = activeEntries.reduce(
    (sum, entry) => sum.add(entry.amount),
    ZERO,
  );
  const pendingRewards = entries.reduce(
    (sum, entry) => sum.add(entry.pendingRewards),
    ZERO,
  );

  return {
    wallet: wallet.toBase58(),
    tokenBalance,
    receiptBalance,
    totalStaked,
    pendingRewards,
    activeEntries,
    entries,
  };
}

export async function loadAdminSnapshot(
  client: SolanaStakingClient,
  connection: Connection,
  poolSnapshot: PoolSnapshot,
): Promise<AdminSnapshot> {
  const allEntries = (await client.searchStakeEntries({
    stakePool: new PublicKey(poolSnapshot.poolAddress),
  })) as AccountLike<StakeEntry>[];

  const now = nowSeconds();
  const unique = new Set<string>();
  let totalDepositedEver = ZERO;
  let totalStaked = ZERO;
  let activePositions = 0;
  let unlockedPositions = 0;
  let completedPositions = 0;

  for (const entry of allEntries) {
    unique.add(entry.account.payer.toBase58());
    totalDepositedEver = totalDepositedEver.add(
      new BN(entry.account.amount.toString()),
    );

    const closed = entry.account.closedTs.gtn(0);
    if (closed) {
      completedPositions += 1;
      continue;
    }

    totalStaked = totalStaked.add(new BN(entry.account.amount.toString()));
    const unlockAt =
      entry.account.createdTs.toNumber() + entry.account.duration.toNumber();
    if (now >= unlockAt) unlockedPositions += 1;
    else activePositions += 1;
  }

  return {
    pool: poolSnapshot,
    totalDepositedEver,
    totalStaked,
    activePositions,
    unlockedPositions,
    completedPositions,
    uniqueWallets: unique.size,
    rewardFunded: new BN(poolSnapshot.rewardPool?.account.fundedAmount.toString() ?? "0"),
    rewardClaimed: new BN(poolSnapshot.rewardPool?.account.claimedAmount.toString() ?? "0"),
    rewardReserve: poolSnapshot.rewardReserve,
  };
}

export function tokenSymbol(): string {
  return TOKEN_SYMBOL;
}
