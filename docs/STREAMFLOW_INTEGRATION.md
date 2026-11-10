# Streamflow native staking integration

This document describes exactly how the frontend talks to Streamflow's deployed Solana
staking programs. It is intentionally conservative: no custom staking program, no
backend custody, no hidden re-staking, no APY promise.

- SDK: `@streamflow/staking@13.4.0` (with `@streamflow/common@^13.4.0`)
- Token program: SPL Token (Token-2022 is accepted by the validator but F106 is
  expected to use SPL Token; the configured pool decides)
- Cluster: `VITE_SOLANA_CLUSTER` (`devnet` default, `mainnet-beta` gated)
- Writes: blocked on Mainnet unless `VITE_MAINNET_WRITES=true`

---

## Program IDs

These are the official IDs published by Streamflow and are pinned in
`src/lib/config.ts`:

| Program | Address |
| --- | --- |
| Stake pool | `STAKEvGqQTtzJZH6BWDcbpzXXn2BBerPAgQ3EGLN2GH` |
| Fixed reward pool | `RWRDdfRbi3339VgKxTAXg4cjyniF7cbhNbMxZWiSKmj` |
| Dynamic reward pool | `RWRDyfZa6Rk9UYi85yjYYfGmoUqffLqjo6vZdFawEez` |
| Fee manager | `FEELzfBhsWXTNJX53zZcDVfRNoFYZQ6cZA3jLiGVL16V` |
| Governor | `GVERNASJFxi8vjjJtwCKYQTeN51XsV1y2B1ap1GtKrKR` |

The installed SDK maps the same IDs for Mainnet, Devnet, Testnet and Local. The app
reads the IDs back from the SDK at runtime (`getProtocolProgramIds()`) and displays
them in the staking/admin panels so a mismatched bundle is visible.

Only **fixed** reward pools are wired. `REWARD_POOL_TYPE` must be `fixed`; setting it
to `dynamic` puts the app into the configuration-missing state instead of guessing.
Reason: the installed SDK's `searchRewardPools()` searches the fixed reward program,
and dynamic pools additionally require governor/vote accounts.

---

## Account model (what the app reads)

The app never trusts local state for balances. Every write is preceded by fresh reads.

### Stake pool

`client.getStakePool(stakePoolAddress)` returns account fields used by the UI:

- `mint`
- `stakeMint` (receipt mint PDA)
- `vault`
- `authority`
- `totalStake`
- `minDuration` / `maxDuration`
- `maxWeight`
- `isTotalStakeCapped`, `remainingTotalStake`
- `expiryTs`
- `freezeStakeMint`, `permissionless`, `autoUnstake`, `unstakePeriod`

`loadPoolSnapshot()` cross-checks:

1. the configured mint equals `pool.mint`;
2. on-chain mint decimals equal `VITE_TOKEN_DECIMALS`;
3. the reward pool belongs to the configured stake pool;
4. the reward pool mint equals the configured token mint;
5. reward-mint decimals equal `VITE_TOKEN_DECIMALS`;
6. the configured reward pool exists (if `VITE_REWARD_POOL` is set).

Any mismatch throws a `ValidationError` and the write path stays locked.

### User position

`client.searchStakeEntries({ payer, stakePool })` returns one account per nonce. For
each entry the app reads the matching `RewardEntry` and calls the SDK's `calcRewards()`
for an **estimated** pending amount. The on-chain claim is authoritative; at a reward
period boundary the estimate can differ by one period.

The unlock timestamp is `createdTs + duration`. Status is one of `LOCKED`, `UNLOCKED`,
`COMPLETED` (based on `closedTs`).

### Reward pool

`client.searchRewardPools({ stakePool })` returns fixed reward pools. The app keeps the
one matching the configured address (or the first matching pool if no address is
configured) and reads its vault balance as the visible reserve.

---

## Instruction flows

All builders live in `src/lib/streamflow/actions.ts`.

### 1. Stake

`prepareStakeAndCreateEntriesInstructions()` → `prepareStakeAction()`

- Finds a free stake-entry nonce (`findFreeStakeNonce`, trying 0..254 and checking the
  derived PDA).
- Adds idempotent Associated Token Account instructions for:
  - the staked token mint,
  - the receipt mint (`deriveStakeMintPDA(stakeProgram, stakePool)`),
  - the reward mint (deduplicated if it is the same mint).
- Creates the stake entry and the reward entry in one transaction.
- Uses the wallet as `invoker` and `authority`.

The Streamflow SDK does **not** add ATA creation instructions itself, so the app adds
them explicitly. Without the receipt-mint ATA, staking fails.

### 2. Claim

`prepareClaimRewardsInstructions()` → `prepareClaimAction()`

- Refuses to build when the estimated pending amount is zero.
- Adds the reward-mint ATA if missing.
- Uses `rewardPoolNonce`, `depositNonce` (the stake-entry nonce), the fixed reward
  program and the configured reward mint.

Fixed reward pools require a manual claim; rewards do not auto-compound.

### 3. Unstake

`prepareUnstakeAndClaimInstructions()` for normal unstake:
- claims pending fixed rewards and returns principal in one transaction.

`prepareUnstakeAndCloseInstructions()` for the emergency path:
- returns principal and closes the position **without claiming**; unclaimed rewards
  are forfeited. The confirmation UI says this explicitly.

The program rejects unstake before `createdTs + duration` (`LockedStake`, error 6013).
The app disables the unstake button while the position is locked and lets the program
reject any bypass attempt.

### 4. Execute

`executeInstructions()` calls `client.execute(ixs, { invoker, computePrice,
computeLimit: "autoSimulate" })`, then polls `getSignatureStatus` until confirmed or
90 seconds elapse.

Before sending, `previewInstructions()`:

- compiles a legacy `Transaction`,
- fetches the fee with `getFeeForMessage`,
- simulates with `simulateTransaction`,
- returns the error and tail of logs to the review modal.

The user must confirm the review/simulation result before signing. The action button
is locked while a transaction is in flight, so double clicks cannot submit duplicates.
A failed transaction surfaces its logs and does not mark the local activity record as
successful.

---

## Reward math (integer only)

Streamflow's public accumulator logic is mirrored in `src/lib/economics.ts`:

```text
weight        = calculateStakeWeight(minDuration, maxDuration, maxWeight, duration)
effective     = amount * weight / 1e9
periods       = floor(duration / rewardPeriod)
rewardPerPeriod = effective * rewardAmount / 1e9
total         = rewardPerPeriod * periods
```

`rewardAmount` is a per-period rate with 9-decimal precision, independent of the token
mint's decimals. For an 8-decimal token and a daily period:

```text
19% annual → rewardAmount = 520,547
per 1.0 token per day = 0.00520547 tokens
```

That is why the naive `52,054` figure is wrong by 10×: `perPeriod` divides by `1e9`,
not by the token's `1e8` base units.

At the full 90-token cap and a 182-day term, 19% annualized pays ≈8.5266 F106, inside
the 10-token allocation. A full year at 19% on 90 would pay 17.10 F106, above the
budget. `npm run economics` prints both figures and the implied rate.

`impliedApr()` derives the live rate from `rewardAmount` and `rewardPeriod`; the app
shows it next to the 19% configuration target and warns when they diverge. The UI never
claims that 19% is an on-chain field. Streamflow has no APY field.

---

## Authority powers (disclosed in the UI)

The stake-pool authority can:

- transfer pool authority to another key;
- update `rewardAmount` / `rewardPeriod` for **future** accrual;
- claw back leftover fixed rewards after pool expiry plus the program delay.

The authority **cannot** move staked principal or rewrite a position's accounted
history. The app shows the current authority on the pool panel and repeats these powers
in the risk section. Before Mainnet, the authority should be a multisig, not a single
hot wallet; document the owner and the change process.

The mint's mint/freeze authorities are displayed in the pool vitals. Before Mainnet:

- confirm the mint is the real F106 mint;
- confirm 8 decimals;
- record supply;
- decide whether mint authority and freeze authority are revoked, held by a multisig,
  or intentionally retained;
- confirm the reward vault is funded with at least the budget implied by the published
  rate.

---

## Error handling

The app recognizes and surfaces:

- `LockedStake` (program error 6013): position still locked;
- simulation failures with the last logs;
- wallet-not-connected / wallet-cannot-sign;
- missing pool/reward pool configuration;
- mint/pool/decimals mismatches (writes disabled);
- no claimable rewards;
- no free stake nonce;
- confirmation timeout.

Transactions are idempotent where the program allows it (idempotent ATA creation);
otherwise the UI prevents duplicate submits while one is pending. A reverted
transaction is never recorded as success.

---

## Deliberate non-goals

- No custom staking or reward contract.
- No server-side key custody.
- No auto-compounding.
- No dynamic reward pool support in this build.
- No pool creation, funding or clawback buttons in the frontend. Those are operator
  actions done with the Streamflow SDK/CLI and documented in the runbook.
- No Mainnet writes by default.
