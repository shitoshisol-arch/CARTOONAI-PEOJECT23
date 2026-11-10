# Mainnet readiness and approval template

Status: **NOT APPROVED — DO NOT ENABLE MAINNET WRITES**

`VITE_MAINNET_WRITES` must remain `false` until this document is completed and signed
off by the token issuer and the pool operator. Creating a Mainnet pool or signing a
Mainnet transaction is a separate, explicit approval step. This build did neither.

---

## 1. Build under review

| Item | Value |
| --- | --- |
| Repository | `https://github.com/html-crm/CARTOONAI-PEOJECT23` |
| Commit | `<sha>` |
| Build command | `npm ci && npm run build` |
| Build result | `<pass/fail>` |
| Frontend URL | `<url>` |
| Streamflow SDK | `@streamflow/staking@13.4.0` |
| Cluster | `mainnet-beta` |
| `VITE_MAINNET_WRITES` | `false` at review time |

---

## 2. Mint verification (on-chain)

Paste the actual values read from a trusted RPC, not from the brief.

| Check | Expected | On-chain value | Pass |
| --- | --- | --- | --- |
| Mint address | the real F106 mint | `<address>` | ☐ |
| Owner / token program | SPL Token (or declared Token-2022) | `<program>` | ☐ |
| Decimals | `8` | `<decimals>` | ☐ |
| Supply | documented | `<supply>` | ☐ |
| Mint authority | revoked or documented multisig | `<address or NONE>` | ☐ |
| Freeze authority | revoked or documented | `<address or NONE>` | ☐ |
| Metadata / name / symbol | F106 / FILE106 as intended | `<value>` | ☐ |

Verification command (example):

```bash
solana account <MINT> --url <TRUSTED_RPC> --output json
spl-token display <MINT> --url <TRUSTED_RPC>
```

Record the slot, RPC provider and date:

- RPC: `<url>`
- Slot: `<slot>`
- Date (UTC): `<date>`
- Verified by: `<name>`

If the mint address is still "Later" or cannot be verified, **stop here**.

---

## 3. Stake pool verification

| Field | Required | Actual | Pass |
| --- | --- | --- | --- |
| Program | `STAKEvGqQTtzJZH6BWDcbpzXXn2BBerPAgQ3EGLN2GH` | `<value>` | ☐ |
| Pool address | configured in `VITE_STAKE_POOL` | `<value>` | ☐ |
| Mint | matches section 2 | `<value>` | ☐ |
| `minDuration` | `182 days` | `<value>` | ☐ |
| `maxDuration` | `182 days` | `<value>` | ☐ |
| `maxWeight` | `1.0x` (`1_000_000_000`) | `<value>` | ☐ |
| `maxTotalStakeCumulative` | `90` tokens in base units | `<value>` | ☐ |
| `expiryTs` | `0` or documented | `<value>` | ☐ |
| `unstakePeriod` | `0` or documented | `<value>` | ☐ |
| `freezeStakeMint` | `false` | `<value>` | ☐ |
| `permissionless` | `false` | `<value>` | ☐ |
| `autoUnstake` | `false` | `<value>` | ☐ |
| Authority | multisig or documented key | `<value>` | ☐ |
| Vault | program-derived, not operator-controlled | `<value>` | ☐ |

Authority powers to disclose in writing:

- can change pool authority;
- can update future `rewardAmount` / `rewardPeriod`;
- can claw back **leftover fixed rewards** after expiry + program delay;
- cannot move staked principal.

---

## 4. Fixed reward pool verification

| Field | Required | Actual | Pass |
| --- | --- | --- | --- |
| Program | `RWRDdfRbi3339VgKxTAXg4cjyniF7cbhNbMxZWiSKmj` | `<value>` | ☐ |
| Reward pool address | configured in `VITE_REWARD_POOL` | `<value>` | ☐ |
| Reward mint | same as F106 mint | `<value>` | ☐ |
| Reward decimals | `8` | `<value>` | ☐ |
| `rewardPeriod` | documented (daily = `86400`) | `<value>` | ☐ |
| `rewardAmount` | documented integer | `<value>` | ☐ |
| Implied APR at 1.0x | matches approved copy | `<value>` | ☐ |
| Reward vault balance | ≥ approved budget | `<value>` | ☐ |
| Vault address | `rewardPool.vault` | `<value>` | ☐ |

Use `npm run economics` to generate the numbers. Confirm that the on-chain
`rewardAmount` / `rewardPeriod` imply the same rate the marketing copy advertises.

---

## 5. Economics signoff (blocking)

The brief has contradictions. One definition must be chosen in writing.

| Question | Answer |
| --- | --- |
| Is 19% annualized and paid over the 182-day term? | `<yes/no>` |
| Or is 19% paid for a full year? | `<yes/no>` |
| Has the `10% × duration/182d` formula been removed? | `<yes/no>` |
| Has the `10 → 2.5` (25%) example been removed? | `<yes/no>` |
| Is the `21.2 F106` allocation figure withdrawn or funded? | `<yes/no>` |
| Exact published wording | `<copy>` |
| Full-term liability at the advertised rate | `<tokens>` |
| Reward budget | `10 F106` |
| Funded? | `<yes/no>` |
| Who approved the wording? | `<name/date>` |

Reference numbers:

- 19% annualized × 90 tokens × 182/365 = **≈8.53 F106** (fits the 10-token budget).
- 19% × 90 tokens for a full year = **17.10 F106** (does not fit).
- 10-token budget on 90 tokens supports **≈11.11%** simple annualized for a full year.
- 10% × 182/182 × 90 = **9 F106** (the brief's own formula, not 19%).

If the advertised wording and the funded vault do not match, **do not publish**.

---

## 6. Frontend security checks

| Check | Pass |
| --- | --- |
| `VITE_TOKEN_MINT`, `VITE_STAKE_POOL`, `VITE_REWARD_POOL` are real addresses | ☐ |
| No private key or seed phrase in any `VITE_*` value | ☐ |
| `VITE_MAINNET_WRITES=false` in the production env | ☐ |
| Mint/pool/reward-pool mismatch blocks writes (tested by changing a value) | ☐ |
| Decimals mismatch blocks writes | ☐ |
| Simulation runs before every signature | ☐ |
| Duplicate-submit lock works | ☐ |
| Locked unstake is disabled in the UI and rejected by the program | ☐ |
| Emergency `unstakeAndClose` warning is visible | ☐ |
| Authority powers are disclosed | ☐ |
| Read-only admin has no withdrawal/confiscation action | ☐ |
| Mobile + desktop nav to `/staking` works | ☐ |

---

## 7. Test evidence

| Test | Evidence | Pass |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | ☐ |
| Production build | `npm run build` | ☐ |
| Local E2E (cloned Devnet programs) | `docs/DEVNET_RESULTS.md` | ☐ |
| Public Devnet E2E (funded keypair) | `<signatures>` | ☐ |
| Mainnet read-only smoke test | `<URL/slot>` | ☐ |
| Mainnet small-value stake/claim/unstake (explicit approval required) | `<signatures>` | ☐ |

Do not sign the Mainnet smoke test until the mint, pool, reward pool, budget and copy
are all verified. Use a small amount first, then reconcile the on-chain reward entry
with `calcRewards()`.

---

## 8. Residual risks and limitations

- Fixed reward pools require manual claims; unclaimed rewards are forfeited by
  `unstakeAndClose`.
- Pending rewards are estimates at period boundaries; the on-chain claim is
  authoritative.
- Streamflow's authority can update future reward parameters; the published rate is not
  immutable.
- Dynamic reward pools are not supported by this build.
- Public Devnet faucet is closed; public-Devnet testing requires a pre-funded keypair.
- The frontend cannot create/fund pools; operator steps must be independently
  documented and reviewed.
- Wallet adapter behavior differs across Phantom/Solflare versions; test both.

---

## 9. Approval

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Token issuer | `<name>` | approve / reject | `<date>` |
| Pool operator | `<name>` | approve / reject | `<date>` |
| Security reviewer | `<name>` | approve / reject | `<date>` |
| Economics/marketing owner | `<name>` | approve / reject | `<date>` |

Only after every row is signed:

1. set `VITE_MAINNET_WRITES=true` in the production environment;
2. redeploy;
3. verify the UI shows `MAINNET` and writes enabled;
4. run the small-value smoke test;
5. publish the final report with signatures and the exact advertised rate.
