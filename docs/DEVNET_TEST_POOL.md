# Devnet test pool

This is a disposable **Devnet** pool used to prove the Streamflow integration end to
end. It is not F106 Mainnet and has no value.

| Field | Value |
| --- | --- |
| Cluster | Devnet (`https://api.devnet.solana.com`) |
| Mint | `6ztfGd4EebntaSWQyg4hkHNfA2xJ5qEuWFrBXP1RGoYj` |
| Decimals | 8 |
| Stake pool | `GPS47aw7LQwCmgUTLTYDs1cX6Eptji6YXoVNvkYjUzdb` |
| Fixed reward pool | `C7aEa7FF5G7tDwmpQdzAg79Ro2nnEswzYbrFFzhsRp5y` |
| Lock | 1 day (`min = max = 86400s`) |
| Cap | 1,000 test tokens |
| Reward period | 60 seconds |
| Reward amount | `361` base units per effective token per period |
| Implied APR | 18.97416% (integer truncation) |
| Reward vault | 100 test tokens |
| Permissionless | Yes, anyone can stake |

## How to use it

1. Open <https://chillguyrich.fun/staking>.
2. In Phantom, switch the network to **Devnet**.
3. Connect the wallet.
4. Click **CLAIM 100 TEST TOKENS**. The serverless faucet sends 100 test tokens and,
   if the wallet has no Devnet SOL, 0.03 SOL for fees.
5. Enter an amount and stake. Rewards accrue every 60 seconds.
6. Claim rewards after the lock, or unstake after 1 day.

The claim button appears only when the site is configured with `VITE_TEST_FAUCET=true`
and the pool is loaded. The Mainnet build never enables it.

## How it was created

```bash
npx tsx scripts/create-devnet-test-pool.ts
```

The script:

- funds a disposable authority keypair from the operator's Devnet wallet;
- creates an 8-decimal mint;
- creates the permissionless stake pool and fixed reward pool with the audited
  Streamflow programs;
- funds the reward vault;
- writes addresses and signatures to `docs/devnet-test-pool.json`.

The authority keypair is stored locally in `.devnet-pool-authority.json` and is
gitignored. Its private key is also stored as a Vercel secret
(`TEST_MINT_AUTHORITY`) so the faucet can mint test tokens. The key controls only this
disposable Devnet mint.

## Proof that staking works on this pool

A live smoke run against the public Devnet RPC:

| Step | Result |
| --- | --- |
| Stake 10 tokens | `51rZ4yY3Dei62sXbq7bccTY4PURA86KhrTxd1ZbHAEFdZvLqT67GZveWekeefbPUibY27uWpcCiHV5EKycWET1FY` |
| Stake entry | `7kVrMKV3V36wu73Akt9eNjeS4YokAqbnqU2ML4MscnhL` (amount `1000000000`) |
| Estimated after 65s | `361` base units |
| Claim | `4XKyBLa6mfkb2GK81ATVmYyZbe6t8VaMBQiApnVqup5BErcYc2DQ2K7wKSh7cZvkrzMgQ3D4mFwoBs6BJDbS7exV` |
| Balance after claim | `989000000361` base units |

The receipt ATA must exist before staking; the frontend creates it automatically. The
claim matched the SDK calculator exactly.

## Limitations

- The mint, pool, and reward pool are disposable Devnet assets. They can disappear
  with Devnet resets.
- The reward vault is only 100 test tokens. Withdrawing large amounts can exhaust it.
- The lock is 1 day, so unstaking requires waiting for unlock.
- This does not validate the F106 Mainnet integration. Mainnet writes remain locked.
