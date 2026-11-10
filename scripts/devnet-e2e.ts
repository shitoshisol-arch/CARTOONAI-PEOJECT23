/**
 * Devnet end-to-end harness for the CHILL106 Streamflow integration.
 *
 * This script ONLY creates test assets on Solana Devnet. It refuses to run
 * against a Mainnet RPC unless ALLOW_NON_DEVNET_E2E=true is explicitly set.
 *
 * Usage:
 *   npx tsx scripts/devnet-e2e.ts
 *
 * It prints every signature so the run can be audited on Solscan.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import { ICluster } from "@streamflow/common";
import {
  SolanaStakingClient,
  calcRewards,
  deriveStakeMintPDA,
  type RewardEntry,
  type RewardPool,
  type StakeEntry,
} from "@streamflow/staking";

const DAY = 86_400;
const YEAR = 31_536_000;
const DECIMALS = 8;
const ONE = 10 ** DECIMALS;
const WALLET_PATH = process.env.DEVNET_WALLET ?? ".devnet-test-wallet.json";
const RPC = process.env.DEVNET_RPC_URL ?? clusterApiUrl("devnet");
const RESULT_PATH = process.env.E2E_RESULT_PATH ?? "devnet-e2e-result.json";
const PRODUCTION_CLAIM_WAIT = Number(
  process.env.E2E_PRODUCTION_CLAIM_WAIT_SECONDS ?? "125",
);
const PRODUCTION_REWARD_PERIOD = Number(
  process.env.E2E_PRODUCTION_REWARD_PERIOD_SECONDS ?? String(DAY),
);
const LIFECYCLE_WAIT = Number(process.env.E2E_LIFECYCLE_WAIT_SECONDS ?? "40");

if (/mainnet/i.test(RPC) && process.env.ALLOW_NON_DEVNET_E2E !== "true") {
  throw new Error(
    "Refusing Mainnet RPC. This harness is Devnet-only. Set ALLOW_NON_DEVNET_E2E=true to override deliberately.",
  );
}
if (!/devnet|localhost|127\.0\.0\.1/i.test(RPC)) {
  throw new Error(
    `Refusing unexpected RPC ${RPC}. Use a Devnet RPC or local validator.`,
  );
}

function loadPayer(): Keypair {
  if (existsSync(WALLET_PATH)) {
    const secret = JSON.parse(readFileSync(WALLET_PATH, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const payer = Keypair.generate();
  writeFileSync(WALLET_PATH, JSON.stringify(Array.from(payer.secretKey)));
  return payer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rewardAmountForApy(apyPercent: number, rewardPeriodSeconds: number): BN {
  const apyBps = BigInt(Math.round(apyPercent * 100));
  const period = BigInt(Math.round(rewardPeriodSeconds));
  const numerator = apyBps * period * 1_000_000_000n;
  const denominator = 10_000n * BigInt(YEAR);
  return new BN((numerator / denominator).toString());
}

function usdLike(raw: BN): string {
  const whole = raw.div(new BN(ONE));
  const frac = raw.mod(new BN(ONE)).toString().padStart(DECIMALS, "0").slice(0, 6);
  return `${whole.toString()}.${frac}`;
}

const signatures: Record<string, string> = {};
const results: Record<string, unknown> = {};

/**
 * Poll for signature status instead of confirmTransaction(blockhash). The
 * Streamflow SDK already sends + confirms internally, so this only verifies
 * the result and surfaces program errors.
 */
async function confirm(connection: Connection, signature: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized")
    ) {
      return;
    }
    await sleep(1_000);
  }
  throw new Error(`Transaction ${signature} was not confirmed within 60s`);
}

function persist(payload: Record<string, unknown>): void {
  writeFileSync(RESULT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Result written to ${RESULT_PATH}`);
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const payer = loadPayer();
  const client = new SolanaStakingClient({
    clusterUrl: RPC,
    cluster: ICluster.Devnet,
    commitment: "confirmed",
  });

  console.log(`RPC: ${RPC}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  let balance = await connection.getBalance(payer.publicKey);
  console.log(`Starting balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  for (let attempt = 0; attempt < 4 && balance < 2 * LAMPORTS_PER_SOL; attempt += 1) {
    try {
      console.log(`Requesting airdrop (attempt ${attempt + 1})…`);
      const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
      await confirm(connection, sig);
    } catch (error) {
      console.warn(`Airdrop attempt failed: ${(error as Error).message}`);
      await sleep(2_000);
    }
    balance = await connection.getBalance(payer.publicKey);
  }
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    throw new Error(
      "Insufficient Devnet SOL. Fund the payer above, then re-run. This is an external faucet/RPC limitation, not a code failure.",
    );
  }
  results.payer = payer.publicKey.toBase58();
  results.rpc = RPC;
  results.startingBalanceSol = balance / LAMPORTS_PER_SOL;

  // 1. Test mint: 8 decimals, no freeze authority, payer controls mint authority.
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    DECIMALS,
    undefined,
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );
  results.mint = mint.toBase58();
  console.log(`Mint: ${mint.toBase58()}`);

  const payerAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID,
  );
  const mintSig = await mintTo(
    connection,
    payer,
    mint,
    payerAta.address,
    payer,
    1_000n * BigInt(ONE),
    [],
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );
  signatures.mintTokens = mintSig;
  results.payerAta = payerAta.address.toBase58();
  console.log(`Minted 1000 test tokens: ${mintSig}`);

  // 2. Production-shaped pool: 90 cap, 182-day lock, 1x weight, 19% annual.
  // The reward period defaults to one day; it can be compressed for local
  // validators (E2E_PRODUCTION_REWARD_PERIOD_SECONDS) without changing the
  // implied rate, because rewardAmount is scaled to the period.
  const rewardAmountDaily = rewardAmountForApy(19, PRODUCTION_REWARD_PERIOD);
  const stakePoolNonce = 0;
  const createPool = await client.prepareCreateStakePoolInstructions(
    {
      mint,
      nonce: stakePoolNonce,
      maxWeight: new BN(1_000_000_000),
      minDuration: new BN(182 * DAY),
      maxDuration: new BN(182 * DAY),
      permissionless: false,
      freezeStakeMint: false,
      unstakePeriod: new BN(0),
      maxTotalStakeCumulative: new BN(90).mul(new BN(ONE)),
      expiryTs: new BN(0),
      autoUnstake: false,
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    { invoker: payer },
  );
  const createPoolSig = await client.execute(createPool.ixs, { invoker: payer });
  await confirm(connection, createPoolSig.signature);
  signatures.createStakePool = createPoolSig.signature;
  const stakePool = createPool.publicKey;
  results.stakePool = stakePool.toBase58();
  console.log(`Stake pool: ${stakePool.toBase58()} (${createPoolSig.signature})`);

  const createRewardPool = await client.prepareCreateRewardPoolInstructions(
    {
      stakePool,
      stakePoolMint: mint,
      stakePoolNonce,
      rewardMint: mint,
      nonce: 0,
      rewardAmount: rewardAmountDaily,
      rewardPeriod: new BN(PRODUCTION_REWARD_PERIOD),
      permissionless: false,
      lastClaimPeriodOpt: null,
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    { invoker: payer },
  );
  const createRewardSig = await client.execute(createRewardPool.ixs, { invoker: payer });
  await confirm(connection, createRewardSig.signature);
  signatures.createRewardPool = createRewardSig.signature;
  const rewardPool = createRewardPool.publicKey;
  results.rewardPool = rewardPool.toBase58();
  results.rewardAmountDaily = rewardAmountDaily.toString();
  console.log(`Reward pool: ${rewardPool.toBase58()} (${createRewardSig.signature})`);

  const rewardFundAmount = new BN(10).mul(new BN(ONE));
  const fund = await client.prepareFundPoolInstructions(
    {
      stakePool,
      stakePoolMint: mint,
      rewardMint: mint,
      nonce: 0,
      amount: rewardFundAmount,
      tokenProgramId: TOKEN_PROGRAM_ID,
      feeValue: null,
      rewardPoolType: "fixed",
    },
    { invoker: payer },
  );
  const fundSig = await client.execute(fund.ixs, { invoker: payer });
  await confirm(connection, fundSig.signature);
  signatures.fundRewardPool = fundSig.signature;
  console.log(`Funded 10 reward tokens: ${fundSig.signature}`);

  // Ensure the receipt mint ATA exists before staking. Streamflow does not add it.
  const stakeMint = deriveStakeMintPDA(
    client.getCurrentProgramId("stakePoolProgram"),
    stakePool,
  );
  await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    stakeMint,
    payer.publicKey,
    true,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID,
  );
  results.stakeMint = stakeMint.toBase58();

  const stakeAmount = new BN(10).mul(new BN(ONE));
  const stake = await client.prepareStakeAndCreateEntriesInstructions(
    {
      nonce: 0,
      amount: stakeAmount,
      duration: new BN(182 * DAY),
      stakePool,
      stakePoolMint: mint,
      tokenProgramId: TOKEN_PROGRAM_ID,
      rewardPools: [{ nonce: 0, mint, rewardPoolType: "fixed" }],
    },
    { invoker: payer, authority: payer.publicKey },
  );
  const stakeSig = await client.execute(stake.ixs, { invoker: payer });
  await confirm(connection, stakeSig.signature);
  signatures.stake = stakeSig.signature;
  console.log(`Staked 10 F106 for 182 days: ${stakeSig.signature}`);

  const poolAccount = await client.getStakePool(stakePool);
  const rewardPools = (await client.searchRewardPools({ stakePool })) as Array<{
    publicKey: { toBase58(): string };
    account: RewardPool;
  }>;
  const entries = (await client.searchStakeEntries({
    payer: payer.publicKey,
    stakePool,
  })) as Array<{ publicKey: { toBase58(): string }; account: StakeEntry }>;
  const rewardEntries = (await client.searchRewardEntries({
    rewardPool,
    stakeEntry: entries[0]?.publicKey,
  })) as Array<{ publicKey: { toBase58(): string }; account: RewardEntry }>;

  results.poolTotalStake = poolAccount.totalStake.toString();
  results.rewardPoolsFound = rewardPools.length;
  results.entriesFound = entries.length;
  results.stakeEntry = entries[0]?.publicKey.toBase58();
  results.rewardEntry = rewardEntries[0]?.publicKey.toBase58();
  console.log(`Pool total stake: ${poolAccount.totalStake.toString()}`);
  console.log(`Stake entries: ${entries.length}; reward entries: ${rewardEntries.length}`);
  results.impliedApyPercentFromDailyReward =
    (Number(rewardAmountDaily.toString()) * (31_536_000 / PRODUCTION_REWARD_PERIOD) * 100) /
    1_000_000_000;
  results.rewardPeriodSeconds = PRODUCTION_REWARD_PERIOD;
  results.balanceBeforeClaim = (
    await connection.getTokenAccountBalance(payerAta.address)
  ).value.amount;

  // 3. Claim after two daily periods. This takes ~125 seconds.
  console.log(`Waiting ${PRODUCTION_CLAIM_WAIT}s for two daily reward periods…`);
  await sleep(PRODUCTION_CLAIM_WAIT * 1_000);
  let claimable = new BN(0);
  if (rewardEntries[0]) {
    claimable = calcRewards(
      rewardEntries[0] as never,
      entries[0] as never,
      rewardPools[0] as never,
    );
  }
  results.claimableBeforeClaim = claimable.toString();
  console.log(`Estimated claimable: ${usdLike(claimable)} F106`);

  const claim = await client.prepareClaimRewardsInstructions(
    {
      stakePool,
      stakePoolMint: mint,
      tokenProgramId: TOKEN_PROGRAM_ID,
      rewardMint: mint,
      rewardPoolType: "fixed",
      rewardPoolNonce: 0,
      depositNonce: 0,
    },
    { invoker: payer },
  );
  const claimSig = await client.execute(claim.ixs, { invoker: payer });
  await confirm(connection, claimSig.signature);
  signatures.claim = claimSig.signature;
  console.log(`Claimed rewards: ${claimSig.signature}`);

  const afterClaimBalance = await connection.getTokenAccountBalance(payerAta.address);
  results.balanceAfterClaim = afterClaimBalance.value.amount;
  results.claimDelta = new BN(afterClaimBalance.value.amount)
    .sub(new BN(results.balanceBeforeClaim as string))
    .toString();
  results.claimableBeforeClaim = claimable.toString();
  results.claimMatchesCalculator = results.claimDelta === claimable.toString();

  // 4. Early unstake must be rejected by the program for the 182-day lock.
  let earlyUnstakeRejected = false;
  let earlyUnstakeError = "";
  try {
    const earlyUnstake = await client.prepareUnstakeAndClaimInstructions(
      {
        stakePool,
        stakePoolMint: mint,
        tokenProgramId: TOKEN_PROGRAM_ID,
        nonce: 0,
        rewardPools: [{ nonce: 0, mint, rewardPoolType: "fixed" }],
      },
      { invoker: payer },
    );
    const earlySig = await client.execute(earlyUnstake.ixs, { invoker: payer });
    await confirm(connection, earlySig.signature);
    signatures.earlyUnstakeUnexpected = earlySig.signature;
  } catch (error) {
    earlyUnstakeRejected = true;
    earlyUnstakeError = (error as Error).message.slice(0, 500);
  }
  results.earlyUnstakeRejected = earlyUnstakeRejected;
  results.earlyUnstakeError = earlyUnstakeError;
  console.log(
    earlyUnstakeRejected
      ? `Early unstake rejected as expected: ${earlyUnstakeError.slice(0, 160)}`
      : "WARNING: early unstake was accepted; investigate pool duration.",
  );

  // 5. Lifecycle pool: short lock so stake -> claim -> unstake can be proven.
  const lifecycleDuration = 30;
  const lifecycleRewardPeriod = 10;
  const createLifecyclePool = await client.prepareCreateStakePoolInstructions(
    {
      mint,
      nonce: 1,
      maxWeight: new BN(1_000_000_000),
      minDuration: new BN(lifecycleDuration),
      maxDuration: new BN(lifecycleDuration),
      permissionless: false,
      freezeStakeMint: false,
      unstakePeriod: new BN(0),
      maxTotalStakeCumulative: new BN(90).mul(new BN(ONE)),
      expiryTs: new BN(0),
      autoUnstake: false,
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    { invoker: payer },
  );
  const lifecyclePoolSig = await client.execute(createLifecyclePool.ixs, { invoker: payer });
  await confirm(connection, lifecyclePoolSig.signature);
  signatures.createLifecyclePool = lifecyclePoolSig.signature;
  const lifecyclePool = createLifecyclePool.publicKey;

  const createLifecycleRewardPool = await client.prepareCreateRewardPoolInstructions(
    {
      stakePool: lifecyclePool,
      stakePoolMint: mint,
      stakePoolNonce: 1,
      rewardMint: mint,
      nonce: 0,
      rewardAmount: rewardAmountForApy(19, lifecycleRewardPeriod),
      rewardPeriod: new BN(lifecycleRewardPeriod),
      permissionless: false,
      lastClaimPeriodOpt: null,
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    { invoker: payer },
  );
  const lifecycleRewardSig = await client.execute(createLifecycleRewardPool.ixs, {
    invoker: payer,
  });
  await confirm(connection, lifecycleRewardSig.signature);
  signatures.createLifecycleRewardPool = lifecycleRewardSig.signature;
  const lifecycleRewardPool = createLifecycleRewardPool.publicKey;

  const lifecycleFund = await client.prepareFundPoolInstructions(
    {
      stakePool: lifecyclePool,
      stakePoolMint: mint,
      rewardMint: mint,
      nonce: 0,
      amount: new BN(2).mul(new BN(ONE)),
      tokenProgramId: TOKEN_PROGRAM_ID,
      feeValue: null,
      rewardPoolType: "fixed",
    },
    { invoker: payer },
  );
  const lifecycleFundSig = await client.execute(lifecycleFund.ixs, { invoker: payer });
  await confirm(connection, lifecycleFundSig.signature);
  signatures.fundLifecycleRewardPool = lifecycleFundSig.signature;

  const lifecycleStakeMint = deriveStakeMintPDA(
    client.getCurrentProgramId("stakePoolProgram"),
    lifecyclePool,
  );
  await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    lifecycleStakeMint,
    payer.publicKey,
    true,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID,
  );

  const lifecycleStake = await client.prepareStakeAndCreateEntriesInstructions(
    {
      nonce: 0,
      amount: new BN(5).mul(new BN(ONE)),
      duration: new BN(lifecycleDuration),
      stakePool: lifecyclePool,
      stakePoolMint: mint,
      tokenProgramId: TOKEN_PROGRAM_ID,
      rewardPools: [{ nonce: 0, mint, rewardPoolType: "fixed" }],
    },
    { invoker: payer, authority: payer.publicKey },
  );
  const lifecycleStakeSig = await client.execute(lifecycleStake.ixs, { invoker: payer });
  await confirm(connection, lifecycleStakeSig.signature);
  signatures.lifecycleStake = lifecycleStakeSig.signature;
  console.log(`Lifecycle stake opened: ${lifecycleStakeSig.signature}`);

  console.log(`Waiting ${LIFECYCLE_WAIT}s for lifecycle lock and reward periods…`);
  await sleep(LIFECYCLE_WAIT * 1_000);

  const lifecycleEntries = (await client.searchStakeEntries({
    payer: payer.publicKey,
    stakePool: lifecyclePool,
  })) as Array<{ publicKey: { toBase58(): string }; account: StakeEntry }>;
  const lifecycleRewardEntries = (await client.searchRewardEntries({
    rewardPool: lifecycleRewardPool,
    stakeEntry: lifecycleEntries[0]?.publicKey,
  })) as Array<{ publicKey: { toBase58(): string }; account: RewardEntry }>;
  const lifecyclePools = (await client.searchRewardPools({
    stakePool: lifecyclePool,
  })) as Array<{ publicKey: { toBase58(): string }; account: RewardPool }>;

  const lifecycleClaimable = lifecycleRewardEntries[0]
    ? calcRewards(
        lifecycleRewardEntries[0] as never,
        lifecycleEntries[0] as never,
        lifecyclePools[0] as never,
      )
    : new BN(0);
  results.lifecycleClaimable = lifecycleClaimable.toString();

  const lifecycleBalanceBeforeClaim = (
    await connection.getTokenAccountBalance(payerAta.address)
  ).value.amount;
  results.lifecycleBalanceBeforeClaim = lifecycleBalanceBeforeClaim;

  const lifecycleClaim = await client.prepareClaimRewardsInstructions(
    {
      stakePool: lifecyclePool,
      stakePoolMint: mint,
      tokenProgramId: TOKEN_PROGRAM_ID,
      rewardMint: mint,
      rewardPoolType: "fixed",
      rewardPoolNonce: 0,
      depositNonce: 0,
    },
    { invoker: payer },
  );
  const lifecycleClaimSig = await client.execute(lifecycleClaim.ixs, { invoker: payer });
  await confirm(connection, lifecycleClaimSig.signature);
  signatures.lifecycleClaim = lifecycleClaimSig.signature;

  const lifecycleBalanceAfterClaim = (
    await connection.getTokenAccountBalance(payerAta.address)
  ).value.amount;
  results.lifecycleClaimDelta = new BN(lifecycleBalanceAfterClaim)
    .sub(new BN(lifecycleBalanceBeforeClaim))
    .toString();
  results.lifecycleClaimMatchesCalculator =
    results.lifecycleClaimDelta === lifecycleClaimable.toString();

  const unstake = await client.prepareUnstakeAndClaimInstructions(    {
      stakePool: lifecyclePool,
      stakePoolMint: mint,
      tokenProgramId: TOKEN_PROGRAM_ID,
      nonce: 0,
      rewardPools: [{ nonce: 0, mint, rewardPoolType: "fixed" }],
    },
    { invoker: payer },
  );
  const unstakeSig = await client.execute(unstake.ixs, { invoker: payer });
  await confirm(connection, unstakeSig.signature);
  signatures.lifecycleUnstake = unstakeSig.signature;
  console.log(`Lifecycle unstake + claim: ${unstakeSig.signature}`);

  const lifecycleBalanceAfterUnstake = (
    await connection.getTokenAccountBalance(payerAta.address)
  ).value.amount;
  results.lifecycleUnstakeDelta = new BN(lifecycleBalanceAfterUnstake)
    .sub(new BN(lifecycleBalanceAfterClaim))
    .toString();

  const finalBalance = await connection.getTokenAccountBalance(payerAta.address);
  results.finalTokenBalance = finalBalance.value.amount;
  results.lifecyclePool = lifecyclePool.toBase58();
  results.lifecycleRewardPool = lifecycleRewardPool.toBase58();
  results.signatures = signatures;
  results.expectedApyPercent = 19;
  results.finishedAt = new Date().toISOString();

  console.log("\n=== DEVNET E2E RESULT ===");
  console.log(JSON.stringify(results, null, 2));
  persist({ ok: true, ...results });
  console.log("\nDevnet/local signatures have no Mainnet effect.");
}

main().catch((error) => {
  console.error("\nDEVNET E2E FAILED");
  console.error(error);
  const payload = {
    ok: false,
    finishedAt: new Date().toISOString(),
    error: (error as Error).message,
    signatures,
    partial: results,
  };
  console.error(JSON.stringify(payload, null, 2));
  persist(payload);
  process.exitCode = 1;
});
