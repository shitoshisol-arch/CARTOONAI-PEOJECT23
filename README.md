# CHILL106 / FILE106

A dark archive/investigation-terminal frontend for the CHILL106 (F106) token, with a
native `/staking` surface built on Streamflow's audited Solana staking programs.

> **Status: frontend complete; on-chain pool not configured; Mainnet not touched.**
> The token mint is still specified as "Later" in the brief, so the app intentionally
> boots into `AWAITING POOL CONFIGURATION` instead of inventing an address. No
> Mainnet pool was created and no Mainnet transaction was signed.

## Live preview

- Primary site: <https://chillguyrich.fun/>
- Staking: <https://chillguyrich.fun/staking>
- Read-only admin: <https://chillguyrich.fun/staking/admin>
- GitHub Pages mirror: <https://shitoshisol-arch.github.io/CARTOONAI-PEOJECT23/>

The primary domain is served by Vercel (`chill106`, `boost1connects-projects`) with
SPA rewrites and `www` → apex 308 redirects. The GitHub Pages mirror remains available.
The preview is built without production env values, so `/staking` shows the honest
`AWAITING POOL CONFIGURATION` gate. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## What is in the box

| Area | State |
| --- | --- |
| Home / archive / investigation UI | Built, responsive, desktop + mobile |
| `STAKING ↗` navigation (desktop + mobile menu) | Built |
| `/staking` native console | Built |
| `/staking/admin` read-only monitor | Built |
| Wallet connection (Phantom + Solflare) | Built |
| Stake / claim / `unstakeAndClaim` / `unstakeAndClose` | Built and integration-tested against cloned Devnet programs |
| Mint / pool / reward-pool validation | Built; writes hard-blocked on mismatch |
| Simulation before signing | Built |
| Mainnet write lock | Built (`VITE_MAINNET_WRITES=false` by default) |
| Public Devnet transaction run | **Blocked by the public faucet being closed** |
| Local Devnet-program E2E | **Passed** (full lifecycle, real signatures) |
| F106 Mainnet pool | **Not created** (mint unknown) |

The staking integration uses `@streamflow/staking@13.4.0`. It does **not** implement a
custom staking contract, and it does not route users to Streamflow's website.

---

## Economics warning (read before publishing)

The brief contains mutually incompatible numbers. They are surfaced in the UI and in
`npm run economics` rather than hidden:

- `Staked × 0.10 × (Duration / 182d)` is **10% over 182 days**, not 19% annual.
- The examples (`10 → 2.5`) imply **25% annual**.
- 19% on a 90-token cap for a **full year** is **17.10 F106**, but the reward
  allocation is **10 F106**. 10 tokens only supports **≈11.11%** simple annualized
  on the full cap.
- 19% on 90 tokens for a **182-day term** is **≈8.53 F106**, which does fit in 10.
- The brief mentions a `21.2 F106` allocation elsewhere despite defining 10.

**Therefore:** 19% can only be advertised as an *annualized rate paid over the 182-day
term*, fully funded by ≈8.53 of the 10-token budget. It must **not** be advertised as
19% paid for a full year, and it must not be described as the 10% formula. The final
marketing/legal copy must pick one definition and the reward vault must be funded to
match it. `npm run economics` prints the exact numbers.

Streamflow has no on-chain APY field. The UI derives the live implied rate from
`rewardAmount` / `rewardPeriod` and labels the 19% as a configuration target.

---

## Quick start

```bash
npm install
copy .env.example .env.local   # Windows
# cp .env.example .env.local   # macOS/Linux
npm run dev
```

Open the printed local URL. `/staking` stays locked until a real mint, stake pool and
fixed reward pool are configured.

```bash
npm run typecheck   # TypeScript gate
npm run build       # production bundle in dist/
npm run economics   # economics contradiction report
```

### Required environment

See `.env.example`. The three values that unlock writes:

```dotenv
VITE_TOKEN_MINT=<verified SPL mint>
VITE_STAKE_POOL=<Streamflow stake pool PDA>
VITE_REWARD_POOL=<Streamflow fixed reward pool PDA>
```

Never commit `.env.local`. Never put a private key in a `VITE_*` variable; every
`VITE_*` value is shipped to the browser.

---

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Archive / investigation landing page |
| `/staking` | Pool vitals, wallet position, stake console, projections, review modal, claim/unstake, positions register, protocol/risk panels |
| `/staking/admin` | Read-only pool/position/reward monitor, no admin keys and no withdrawal action |

---

## Repository map

```text
src/
  lib/config.ts                 env parsing, cluster, program IDs, write gates
  lib/economics.ts              reward math, implied APR, budget audit
  lib/streamflow/client.ts      Streamflow client factory + program snapshot
  lib/streamflow/reads.ts       pool/user/admin reads + mint validation
  lib/streamflow/actions.ts     instruction builders, ATAs, simulation, send
  hooks/useStakingData.ts       polling hooks
  pages/Staking.tsx             native staking console
  pages/Admin.tsx               read-only monitor
scripts/
  devnet-e2e.ts                 guarded local/Devnet lifecycle harness
  economics.ts                  CLI economics audit
docs/
  STREAMFLOW_INTEGRATION.md     SDK integration and account/authority details
  DEVNET_RUNBOOK.md             how to reproduce the test environment
  DEVNET_RESULTS.md             actual signatures and outcomes
  DEPLOYMENT.md                 GitHub Pages build, base path, direct routes
  MAINNET_REPORT_TEMPLATE.md    sign-off checklist before Mainnet writes
```

---

## Testing

Public Devnet could not be used because `https://api.devnet.solana.com` returns
`410 Gone: The RPC faucet is closed on this cluster`. No public-Devnet transaction was
submitted. Instead, the **actual Devnet program bytecode and the Devnet fee-config
account were cloned into a local validator**, and the full lifecycle was executed
there with real signatures.

See [`docs/DEVNET_RESULTS.md`](docs/DEVNET_RESULTS.md) for the run evidence and
[`docs/DEVNET_RUNBOOK.md`](docs/DEVNET_RUNBOOK.md) to reproduce it.

The E2E proved:

- 8-decimal test mint creation and minting;
- production-shaped stake pool (90 cap, 182-day lock, 1.0x weight);
- fixed reward pool creation and funding;
- stake, reward claim with amount matching the SDK calculator, and early-unstake
  rejection (`LockedStake`);
- a short-lock lifecycle pool: stake → claim → successful `unstakeAndClaim`, with
  principal returned exactly and rewards transferred.

It did **not** prove public-Devnet behavior or Mainnet behavior.

---

## Security notes

- Only Streamflow's deployed, audited programs are used. Program IDs are pinned in
  `src/lib/config.ts` and compared at runtime.
- Amounts are integer base units (`BN`); no floating-point arithmetic is used for
  transaction amounts.
- Mint address, pool mint, on-chain decimals and reward-mint decimals are validated
  before writes. A mismatch disables writes.
- Every transaction is simulated before signing. Duplicate clicks are locked while a
  transaction is in flight, and failures are surfaced with logs.
- Mainnet writes are hard-locked unless `VITE_MAINNET_WRITES=true`.
- The app never asks for a seed phrase or private key.
- Pool authority powers (change authority, update future rewards, claw back leftover
  fixed rewards after expiry + delay) are disclosed in the UI. The authority cannot
  move staked principal.

Known limitations:

- Fixed reward pools only. The installed SDK's `searchRewardPools()` does not support
  dynamic pools reliably.
- `calcRewards` is an estimate at reward-period boundaries; the on-chain claim is
  authoritative. The UI labels pending rewards as estimated.
- The app cannot create the pool or fund the reward vault from the browser. Those are
  operator actions documented in `docs/DEVNET_RUNBOOK.md`.
- Streamflow's public Devnet faucet is closed; use a funded wallet or the local
  runbook.

---

## Mainnet gate

Do not flip `VITE_MAINNET_WRITES=true` until every item in
[`docs/MAINNET_REPORT_TEMPLATE.md`](docs/MAINNET_REPORT_TEMPLATE.md) is signed off,
including:

1. real F106 mint address published and verified on-chain;
2. mint decimals = 8, supply and mint/freeze authorities reviewed;
3. stake pool and fixed reward pool created with the audited programs;
4. reward vault funded and implied rate reconciled with the marketing copy;
5. authority/multisig ownership confirmed and disclosed;
6. a small-value Mainnet smoke test approved in writing.

---

## Links

- Original target repository (write access pending): <https://github.com/html-crm/CARTOONAI-PEOJECT23>
- Published mirror + Pages: <https://github.com/shitoshisol-arch/CARTOONAI-PEOJECT23>
- Streamflow staking SDK docs: <https://js-sdk-docs.streamflow.finance/modules/_streamflow_staking.html>
- Streamflow developer docs: <https://developers.streamflow.finance/>
- Streamflow security/audits: <https://docs.streamflow.finance/en/articles/9338573-has-streamflow-been-audited>

The previous live site `https://chillguyrich.fun/` returned HTTP 404 when this build
started; the repository was empty. This frontend is therefore a fresh implementation,
not a patch of a live codebase.
