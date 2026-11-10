/**
 * Creates a disposable public-Devnet test pool for the Chill106 frontend.
 *
 * This is NOT the F106 Mainnet pool. It creates a fresh 8-decimal test mint and a
 * short-lived, permissionless Streamflow pool so the deployed UI can be exercised
 * end to end.
 *
 * Usage:
 *   npx tsx scripts/create-devnet-test-pool.ts
 *
 * Env:
 *   DEVNET_RPC_URL        default https://api.devnet.solana.com
 *   FUNDER_WALLET         default ~/.config/solana/id.json
 *   TEST_AUTHORITY_WALLET default .devnet-pool-authority.json
 *   TEST_RESULT_PATH      default docs/devnet-test-pool.json
 *   TEST_LOCK_SECONDS     default 86400 (1 day)
 *   TEST_REWARD_PERIOD    default 60
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { ICluster } from "@streamflow/common";
import { SolanaStakingClient } from "@streamflow/staking";

const DAY = 86_400;
const YEAR = 31_536_000;
const DECIMALS = 8;
const ONE = 10 ** DECIMALS;
const RPC = process.env.DEVNET_RPC_URL ?? clusterApiUrl("devnet");
const FUNDER_PATH =
  process.env.FUNDER_WALLET ?? join(homedir(), ".config", "solana", "id.json");
const AUTHORITY_PATH =
  process.env.TEST_AUTHORITY_WALLET ?? ".devnet-pool-authority.json";
const RESULT_PATH = process.env.TEST_RESULT_PATH ?? "docs/devnet-test-pool.json";
const LOCK_SECONDS = Number(process.env.TEST_LOCK_SECONDS ?? String(DAY));
const REWARD_PERIOD = Number(process.env.TEST_REWARD_PERIOD ?? "60");
const CAP_TOKENS = Number(process.env.TEST_CAP_TOKENS ?? "1000");
const REWARD_TOKENS = Number(process.env.TEST_REWARD_TOKENS ?? "100");
const FUND_AUTHORITY_SOL = Number(process.env.TEST_FUND_SOL ?? "1.5");
const TARGET_APY = Number(process.env.TEST_TARGET_APY ?? "19");

if (/mainnet/i.test(RPC)) {
  throw new Error("Refusing Mainnet. This script only creates disposable Devnet assets.");
}
if (LOCK_SECONDS < 60) throw new Error("TEST_LOCK_SECONDS must be at least 60");

function loadKeypair(path: string, create: boolean): Keypair {
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  if (!create) throw new Error(`Keypair not found: ${path}`);
  const keypair = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)));
  return keypair;
}

function rewardAmountForApy(apyPercent: number, periodSeconds: number): BN {
  const apyBps = BigInt(Math.round(apyPercent * 100));
  const period = BigInt(Math.round(periodSeconds));
  const numerator = apyBps * period * 1_000_000_000n;
  const denominator = 10_000n * BigInt(YEAR);
  return new BN((numerator / denominator).toString());
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const funder = loadKeypair(FUNDER_PATH, false);
  const authority = loadKeypair(AUTHORITY_PATH, true);

  console.log(`RPC: ${RPC}`);
  console.log(`Funder: ${funder.publicKey.toBase58()}`);
  console.log(`Test authority: ${authority.publicKey.toBase58()}`);

  const funderBalance = await connection.getBalance(funder.publicKey);
  console.log(`Funder balance: ${funderBalance / LAMPORTS_PER_SOL} SOL`);
  if (funderBalance < 0.25 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Funder needs Devnet SOL. Send at least 0.25 SOL to ${funder.publicKey.toBase58()}.`,
    );
  }

  let authorityBalance = await connection.getBalance(authority.publicKey);
  if (authorityBalance < 0.5 * LAMPORTS_PER_SOL) {
    const lamports = Math.round(FUND_AUTHORITY_SOL * LAMPORTS_PER_SOL);
    console.log(`Funding test authority with ${FUND_AUTHORITY_SOL} SOL…`);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: authority.publicKey,
        lamports,
      }),
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [funder], {
      commitment: "confirmed",
    });
    console.log(`Funded authority: ${sig}`);
    authorityBalance = await connection.getBalance(authority.publicKey);
  }
  console.log(`Authority balance: ${authorityBalance / LAMPORTS_PER_SOL} SOL`);

  console.log("Creating 8-decimal test mint…");
  const mint = await createMint(
    connection,
    authority,
    authority.publicKey,
    null,
    DECIMALS,
    undefined,
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );
  console.log(`Mint: ${mint.toBase58()}`);

  const authorityAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID,
  );

  const initialSupply = 10_000n * BigInt(ONE);
  const mintSig = await mintTo(
    connection,
    authority,
    mint,
    authorityAta.address,
    authority,
    initialSupply,
    [],
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );
  console.log(`Minted 10,000 test tokens: ${mintSig}`);

  const client = new SolanaStakingClient({
    clusterUrl: RPC,
    cluster: ICluster.Devnet,
    commitment: "confirmed",
  });

  const createPool = await client.prepareCreateStakePoolInstructions(
    {
      mint,
      nonce: 0,
      maxWeight: new BN(1_000_000_000),
      minDuration: new BN(LOCK_SECONDS),
      maxDuration: new BN(LOCK_SECONDS),
      permissionless: true,
      freezeStakeMint: false,
      unstakePeriod: new BN(0),
      maxTotalStakeCumulative: new BN(CAP_TOKENS).mul(new BN(ONE)),
      expiryTs: new BN(0),
      autoUnstake: false,
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    { invoker: authority },
  );
  const poolSig = await client.execute(createPool.ixs, { invoker: authority });
  console.log(`Stake pool: ${createPool.publicKey.toBase58()} (${poolSig.signature})`);

  const rewardAmount = rewardAmountForApy(TARGET_APY, REWARD_PERIOD);
  const createReward = await client.prepareCreateRewardPoolInstructions(
    {
      stakePool: createPool.publicKey,
      stakePoolMint: mint,
      stakePoolNonce: 0,
      rewardMint: mint,
      nonce: 0,
      rewardAmount,
      rewardPeriod: new BN(REWARD_PERIOD),
      permissionless: true,
      lastClaimPeriodOpt: null,
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    { invoker: authority },
  );
  const rewardSig = await client.execute(createReward.ixs, { invoker: authority });
  console.log(
    `Reward pool: ${createReward.publicKey.toBase58()} (${rewardSig.signature})`,
  );

  const fundAmount = new BN(REWARD_TOKENS).mul(new BN(ONE));
  const fund = await client.prepareFundPoolInstructions(
    {
      stakePool: createPool.publicKey,
      stakePoolMint: mint,
      rewardMint: mint,
      nonce: 0,
      amount: fundAmount,
      tokenProgramId: TOKEN_PROGRAM_ID,
      feeValue: null,
      rewardPoolType: "fixed",
    },
    { invoker: authority },
  );
  const fundSig = await client.execute(fund.ixs, { invoker: authority });
  console.log(`Funded ${REWARD_TOKENS} reward tokens: ${fundSig.signature}`);

  const impliedApy =
    (Number(rewardAmount.toString()) * (YEAR / REWARD_PERIOD) * 100) / 1_000_000_000;

  const result = {
    cluster: "devnet",
    createdAt: new Date().toISOString(),
    rpc: RPC,
    authority: authority.publicKey.toBase58(),
    mint: mint.toBase58(),
    decimals: DECIMALS,
    stakePool: createPool.publicKey.toBase58(),
    rewardPool: createReward.publicKey.toBase58(),
    rewardMint: mint.toBase58(),
    lockSeconds: LOCK_SECONDS,
    rewardPeriodSeconds: REWARD_PERIOD,
    rewardAmount: rewardAmount.toString(),
    rewardFundedTokens: REWARD_TOKENS,
    capTokens: CAP_TOKENS,
    targetApyPercent: TARGET_APY,
    impliedApyPercent: Number(impliedApy.toFixed(6)),
    permissionless: true,
    signatures: {
      mintTokens: mintSig,
      createStakePool: poolSig.signature,
      createRewardPool: rewardSig.signature,
      fundRewardPool: fundSig.signature,
    },
  };

  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nResult written to ${RESULT_PATH}`);
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "\nNext: set VITE_TOKEN_MINT / VITE_STAKE_POOL / VITE_REWARD_POOL in Vercel.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
