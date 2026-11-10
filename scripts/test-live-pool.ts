/**
 * Quick live-pool smoke test against the deployed Devnet test pool.
 * Not part of the app; used to prove stake/claim on public Devnet.
 */
import { readFileSync } from "node:fs";
import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { ICluster } from "@streamflow/common";
import { SolanaStakingClient, calcRewards, deriveStakeMintPDA } from "@streamflow/staking";

const RPC = "https://api.devnet.solana.com";
const authority = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(".devnet-pool-authority.json", "utf8")) as number[],
  ),
);
const poolInfo = JSON.parse(readFileSync("docs/devnet-test-pool.json", "utf8"));
const connection = new Connection(RPC, "confirmed");
const client = new SolanaStakingClient({
  clusterUrl: RPC,
  cluster: ICluster.Devnet,
  commitment: "confirmed",
});

async function main() {
  const mint = new PublicKey(poolInfo.mint);
  const stakePool = new PublicKey(poolInfo.stakePool);
  const rewardPool = new PublicKey(poolInfo.rewardPool);
  const one = 10n ** 8n;

  const payer = authority;
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID,
  );
  console.log("token ATA", ata.address.toBase58());

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
  console.log("receipt ATA ready");

  const amount = new BN(10n * one);
  const stake = await client.prepareStakeAndCreateEntriesInstructions(
    {
      nonce: 0,
      amount,
      duration: new BN(86_400),
      stakePool,
      stakePoolMint: mint,
      tokenProgramId: TOKEN_PROGRAM_ID,
      rewardPools: [{ nonce: 0, mint, rewardPoolType: "fixed" }],
    },
    { invoker: payer, authority: payer.publicKey },
  );
  const stakeSig = await client.execute(stake.ixs, { invoker: payer });
  console.log("stake signature", stakeSig.signature);

  const entries = (await client.searchStakeEntries({
    payer: payer.publicKey,
    stakePool,
  })) as Array<{ publicKey: { toBase58(): string }; account: any }>;
  const entry = entries[0];
  console.log("stake entry", entry.publicKey.toBase58(), entry.account.amount.toString());

  console.log("waiting 65s for reward period...");
  await new Promise((r) => setTimeout(r, 65_000));

  const rewardPools = (await client.searchRewardPools({ stakePool })) as Array<{
    publicKey: { toBase58(): string };
    account: any;
  }>;
  const rewardEntries = (await client.searchRewardEntries({
    rewardPool,
    stakeEntry: entry.publicKey,
  })) as Array<{ publicKey: { toBase58(): string }; account: any }>;
  const estimate = calcRewards(
    { publicKey: rewardEntries[0].publicKey, account: rewardEntries[0].account },
    { publicKey: entry.publicKey, account: entry.account },
    { publicKey: rewardPools[0].publicKey, account: rewardPools[0].account },
  );
  console.log("estimated claimable", estimate.toString());

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
  console.log("claim signature", claimSig.signature);

  const balance = await connection.getTokenAccountBalance(ata.address);
  console.log("token balance after claim", balance.value.amount);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
