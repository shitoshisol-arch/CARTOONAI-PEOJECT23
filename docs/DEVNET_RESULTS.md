# Devnet test results

> **Scope:** these are **local-validator** transactions. The validator was started from
> the actual Streamflow **Devnet** program bytecode and the Devnet fee-manager config
> account. The signatures are real but are not on the public Devnet ledger, so they do
> not appear on Solscan. No public-Devnet or Mainnet transaction was signed.

Run date: 2026-11-09
Harness: `scripts/devnet-e2e.ts`
SDK: `@streamflow/staking@13.4.0`
Local validator: Agave `1.18.26`
RPC: `http://127.0.0.1:8899`

---

## Attempt history

| Attempt | Result |
| --- | --- |
| Public Devnet (`https://api.devnet.solana.com`) | Blocked before any transaction: `410 Gone: The RPC faucet is closed on this cluster`. No signatures. |
| Local validator, programs only | Mint, stake pool and reward pool created; `fund_pool` failed with `AccountNotInitialized` because the fee-manager `config` PDA was not cloned. |
| Local validator + fee config clone | **Passed** the full lifecycle. |

The fee-manager config account that had to be cloned:

```text
6orprZf4ytxRUEdQUYzRUjfrCExW4ujf9djTeCeHdgeo
```

---

## Successful run

Payer: `CR5QzC19idh1aRADBJvvQhe4W8vKbEjKmNsK6zYYKLLF`
Starting balance: `99.95842164 SOL`
Test mint: `FkCH44xwo8NQ8tBNTEjfxXQxanB3tWWiyR3u2GppCBcM`
Mint decimals: `8`
Minted supply for the test: `1000 F106`

### Production-shaped pool

- Stake pool: `DFqtffzKct8kr5pbbk3tJAVBee6yrqiGxaqnMUHNuK6L`
- Fixed reward pool: `4mw2ojdsH6oPLfJUA7uVPyNokY2pFE5nbR29XBBUWVh2`
- Cap: `90` tokens (`maxTotalStakeCumulative`)
- Lock: `182 days` (min = max)
- Weight: `1.0x`
- Reward budget funded: `10` tokens
- Test reward period: `60 s` (compressed from the production `86,400 s`; `rewardAmount`
  was scaled so the implied rate stays 19% annualized)
- `rewardAmount`: `361` base units per 60 s per effective token
- Implied APR: `18.97416%` (integer truncation; the daily figure is `520,547` →
  `18.9999655%`)
- Stake: `10` tokens
- `calcRewards()` before claim: `361` base units
- Actual claim delta: `361` base units
- `claimMatchesCalculator`: **true**
- Early unstake: **rejected** by the program with `LockedStake` (6013)

### Lifecycle pool (short lock)

- Stake pool: `6aqZ4G8iSu2QMeF6zLgbHAALgXTazb53UHHH8REAz8SU`
- Fixed reward pool: `2wSa45mCqjuSuiMf7mMjaKrydiAVTaHPCJmuiomQEdYA`
- Lock: `30 s`
- Stake: `5` tokens
- Claim transferred: `120` base units
- `calcRewards()` estimate: `180` base units
- `lifecycleClaimMatchesCalculator`: `false` — the estimate was one reward period high
  at the boundary; the on-chain transfer is authoritative. The UI labels pending
  rewards as estimated for this reason.
- Unstake + claim: **succeeded**
- Principal returned: `500,000,000` base units = exactly `5` tokens
- Final token balance: `978.00000481` (after funding 12 tokens of reward vaults)

Account addresses:

- Payer ATA: `2naeB9LUhwka4esyyqQqyztEnKEDCB6ZLhJyTmq5osML`
- Receipt mint: `FqHvp1hYp3UBLydTgjs1GxtUhpYUy4udeFUFakL9Nqj9`
- Stake entry: `9YpXV24sX7kHMMfmkAie324NJciAi5YMBzQY6hrD8CS`
- Reward entry: `7RynMJ5q7bk6xn94PUNwadtJRkSFF78vSdR3CFFum3C5`

---

## Signatures

All signatures below are local-validator signatures from the actual Devnet programs.

| Step | Signature |
| --- | --- |
| Mint test tokens | `5BSWAErDbbAu4DZEX1EAW9GMDcpjd6k21dT2ZVbWdeZjBJS46zrhyFWSfAyaxRGYwLMnGjRPmuz4zi7hCSXZUkQC` |
| Create production stake pool | `hax2fDvoQqgMYKJRRHKbqSyXMUfadUr4udXeMsRdiCxLkPcQzMpPkYPbKjxp2DrxSC53xm8bMQaZVQrSTzgKSWJ` |
| Create fixed reward pool | `2Kq34EAESN6QWYruaSM4rNLLyFmN2weDYSMC6rQDzE97NR57a9fDW89uihQmtRWeCmGT3h6USufk6rUEfoPSXmFr` |
| Fund reward pool (10 tokens) | `25F4z8UCEJNSjqo9f4RV2yEpcgLws2tAhbNAwR6DnVN5yw5CZPKTc2wU14XKACeQMpaCssdGMM7fH4ohKNzarQdL` |
| Stake 10 tokens / 182 days | `5Y4k4ooHuCT7htczaNas64hFoQNRsXQvN8WoQqg7DPfeUWNtLemNNEvxRMmBgURCE6qVCCFRnEHzG9pyB3r6h4JE` |
| Claim | `4SSBiUcU2capneVfWkTZSethzeCKGTMumNLh4EFmqu7xCS3gTNnpTDcV6kUEnWHeeS1LkGwKqbL38hfA8XnQifWe` |
| Create lifecycle pool | `A1kwqeNHPAD1jFwHXMguUWx3DHgM9mHdBxbKREbrYoiSkG114pPQ86yf1G7fGeZHGvog9ENvHvPuLoa4rDXXM7B` |
| Create lifecycle reward pool | `2gWCABf1zKMqLYqZhQV5TJ3sRvrz7y7SjSQ83mcWFuhBwj8Ykx67ceLvFfGoRkvn4jJwNvh92He4EAj6FiEXzp6U` |
| Fund lifecycle reward pool (2 tokens) | `5SUpCEUuTerz2Q7pPjBMn2KRsW9UQSRpPRwp5L7f1Cf7ELdPbYt8GCbRP1iKLbyHtwYoeea8dTbnWNHT6WgE96U7` |
| Lifecycle stake 5 tokens / 30 s | `5kzvqjnd6Jds5jxTqhp3VoBRUqd8QRXeqCfnzLuD9VGViQ6F8iRnjMKycRKY3hGDsnL4BHQRZtstPRD8EQ7TFQ11` |
| Lifecycle claim | `3VkBh8uGBxCEmUz2wo94ZhzeuMQ3Wxs7AWKkPEnEeF3CHJN5FcL4xT7Ko7pJazH5Wt6rkzCNnf3W9uCZ5q8rK6vC` |
| Lifecycle unstake + claim | `3wWVXbeiSMk9A2ovHmHySCP5QotBE5uHpoRiPz4Gq3QptvSwnwZtuVjJYLkewPHx9CyD7wjxEssYT9CY1oNWGY4y` |
| Early unstake attempt (rejected) | no signature — simulation failed with 6013 before send |

The raw result is committed at
[`devnet-local-e2e-result.json`](devnet-local-e2e-result.json).

---

## What this proves and does not prove

Proved against the real program bytecode:

- account derivation and instruction encoding for stake, claim and unstake;
- ATA creation requirements (especially the receipt mint);
- reward vault funding;
- claim transfer matching the SDK calculator for a full reward period;
- early-unstake rejection before lock expiry;
- successful unstake + claim after lock expiry with exact principal return.

Not proved:

- behavior against the public Devnet RPC / public faucet;
- behavior with the real F106 mint (still unpublished);
- Mainnet conditions, congestion, priority fees, or wallet-specific signing quirks;
- the exact 24-hour reward period (the test compressed it while preserving the rate).
  The exact daily `rewardAmount` is `520,547` and is covered by `npm run economics`.
