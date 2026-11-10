# Devnet / local-validator runbook

This is the reproducible path used to test the Streamflow integration without relying
on the closed public Devnet faucet.

> The signatures produced by this runbook are **local-validator signatures**. They are
> real transactions against the actual Streamflow Devnet program bytecode, but they are
> not visible on Solscan. No public-Devnet or Mainnet transaction was signed.

---

## 0. Why not public Devnet?

A first attempt used `https://api.devnet.solana.com` with a fresh keypair
(`CR5QzC19idh1aRADBJvvQhe4W8vKbEjKmNsK6zYYKLLF`). The RPC answered:

```text
410 Gone: The RPC faucet is closed on this cluster.
Request test SOL at https://faucet.solana.com
```

No transaction was submitted. The public faucet requires the web UI at
<https://faucet.solana.com>; this harness does not bypass it. Use one of:

1. a wallet you have already funded from the web faucet, with
   `DEVNET_WALLET=/path/to/keypair.json`, or
2. the local validator path below.

---

## 1. Prerequisites

- Node 20+
- Windows PowerShell (commands below) or an equivalent shell
- Solana CLI + `solana-test-validator`

The machine used for this run had two Agave releases installed:

- `3.1.10` — fails on this Windows/OneDrive environment with
  `Failed to create ledger ... Error checking to unpack genesis archive: ... Access is denied (os error 5)`.
- `1.18.26` — works.

Use the `1.18.26` validator binary explicitly:

```powershell
$validator = "$env:USERPROFILE\.local\share\solana\install\releases\1.18.26\solana-release\bin\solana-test-validator.exe"
& $validator --version   # solana-test-validator 1.18.26
```

If your `3.1.10` validator works, any recent Agave release is fine; the important part
is cloning the programs and the fee config account.

---

## 2. Create a funded payer account

The local faucet can rate-limit `requestAirdrop`. Pre-funding the account at genesis is
more reliable.

```powershell
# Create the wallet once (this file is gitignored)
node -e "const {Keypair}=require('@solana/web3.js');const fs=require('fs');const kp=Keypair.generate();fs.writeFileSync('.devnet-test-wallet.json',JSON.stringify(Array.from(kp.secretKey)));console.log(kp.publicKey.toBase58())"
```

Create `funded-account.json` (gitignored) with the printed public key:

```json
{
  "pubkey": "<PAYER_PUBKEY>",
  "account": {
    "lamports": 100000000000,
    "data": ["", "base64"],
    "owner": "11111111111111111111111111111111",
    "executable": false,
    "rentEpoch": 0
  }
}
```

`100000000000` lamports = 100 SOL. `funded-account.json` is loaded only into the local
validator's genesis; it is not a Mainnet instruction.

---

## 3. Start the validator with cloned programs

```powershell
$validator = "$env:USERPROFILE\.local\share\solana\install\releases\1.18.26\solana-release\bin\solana-test-validator.exe"
$ledger = "C:\Users\DELL\AppData\Local\Temp\opencode\chill106-ledger-118"

if (Test-Path $ledger) { Remove-Item -Recurse -Force $ledger }

& $validator --reset `
  --url https://api.devnet.solana.com `
  --clone-upgradeable-program STAKEvGqQTtzJZH6BWDcbpzXXn2BBerPAgQ3EGLN2GH `
  --clone-upgradeable-program RWRDdfRbi3339VgKxTAXg4cjyniF7cbhNbMxZWiSKmj `
  --clone-upgradeable-program RWRDyfZa6Rk9UYi85yjYYfGmoUqffLqjo6vZdFawEez `
  --clone-upgradeable-program FEELzfBhsWXTNJX53zZcDVfRNoFYZQ6cZA3jLiGVL16V `
  --clone-upgradeable-program GVERNASJFxi8vjjJtwCKYQTeN51XsV1y2B1ap1GtKrKR `
  --clone 6orprZf4ytxRUEdQUYzRUjfrCExW4ujf9djTeCeHdgeo `
  --account <PAYER_PUBKEY> funded-account.json `
  --ledger $ledger `
  --rpc-port 8899
```

Why each clone is needed:

| Address | Why |
| --- | --- |
| `STAKE...` | Stake-pool program that owns the pool and stake entries |
| `RWRDdf...` | Fixed reward program that owns reward pools/entries |
| `RWRDyf...` | Dynamic reward program; cloned for completeness, not used |
| `FEEL...` | Fee-manager program referenced by `fund_pool` |
| `GVERN...` | Governor program; cloned for completeness, not used by fixed pools |
| `6orpr...` | Fee-manager `config` PDA, required by `fund_pool` on Devnet |

`6orprZf4ytxRUEdQUYzRUjfrCExW4ujf9djTeCeHdgeo` is
`findProgramAddressSync(["config"], FEELzfBhsWXTNJX53zZcDVfRNoFYZQ6cZA3jLiGVL16V)`.
Without it, `fund_pool` fails with:

```text
AnchorError caused by account: config.
Error Code: AccountNotInitialized. Error Number: 3012.
```

The ledger is deliberately placed under the temp directory. A ledger inside a
OneDrive-synced folder produced `Access is denied` on this machine.

Verify before running the harness:

```powershell
solana balance <PAYER_PUBKEY> --url http://127.0.0.1:8899   # 100 SOL
solana program show STAKEvGqQTtzJZH6BWDcbpzXXn2BBerPAgQ3EGLN2GH --url http://127.0.0.1:8899
solana account 6orprZf4ytxRUEdQUYzRUjfrCExW4ujf9djTeCeHdgeo --url http://127.0.0.1:8899
```

---

## 4. Run the lifecycle harness

The harness refuses anything that is not Devnet/localhost. It creates fresh test assets
and never touches Mainnet.

```powershell
$env:DEVNET_RPC_URL              = "http://127.0.0.1:8899"
$env:E2E_RESULT_PATH             = "devnet-local-e2e-result.json"
$env:E2E_PRODUCTION_REWARD_PERIOD_SECONDS = "60"   # compress the test period
$env:E2E_PRODUCTION_CLAIM_WAIT_SECONDS    = "65"
$env:E2E_LIFECYCLE_WAIT_SECONDS           = "45"

npx tsx scripts/devnet-e2e.ts
```

What it does:

1. Creates an 8-decimal test mint and mints 1,000 tokens.
2. Creates a production-shaped stake pool: 90-token cap, 182-day lock, 1.0x weight.
3. Creates and funds a fixed reward pool with a 10-token budget.
4. Stakes 10 tokens for 182 days, then claims after one compressed reward period.
5. Attempts an early unstake and expects `LockedStake` (6013).
6. Creates a 30-second lifecycle pool, stakes 5 tokens, claims, waits for unlock, and
   calls `unstakeAndClaim`.
7. Writes every signature and check to `devnet-local-e2e-result.json`.

The default (no env overrides) uses a **daily** reward period and waits 125 seconds, so
the production pool claim accrues zero full periods. That is correct behavior but does
not prove a reward transfer. The compressed 60-second period is used to prove the claim
transfer while keeping the 182-day lock and 90-token cap. To test the exact production
period, leave the period at `86400` and wait a full day.

---

## 5. Expected result

A successful run ends with:

```text
=== DEVNET E2E RESULT ===
{
  "ok": true,
  ...
  "claimMatchesCalculator": true,
  "earlyUnstakeRejected": true,
  "lifecycleUnstakeDelta": "500000000"
}
```

The actual run from this repository is recorded in
[`DEVNET_RESULTS.md`](DEVNET_RESULTS.md).

Key checks:

- `claimDelta` equals the SDK's `calcRewards()` estimate for the production pool.
- `earlyUnstakeRejected` is `true` with program error `6013 LockedStake`.
- `lifecycleUnstakeDelta` equals the 5-token principal (`500000000` base units).
- `lifecycleClaimDelta` is a real reward transfer.

`lifecycleClaimMatchesCalculator` can be `false` by one period at a boundary; the
on-chain claim is authoritative. The UI labels pending rewards as estimated.

---

## 6. Clean up

```powershell
Get-Process solana-test-validator -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force "C:\Users\DELL\AppData\Local\Temp\opencode\chill106-ledger-118"
```

The following files are gitignored and must never be committed:

- `.devnet-test-wallet.json` (secret key)
- `funded-account.json`
- `devnet-local-e2e-result.json`
- `*.log`
- `.env.local`

---

## 7. Public Devnet variant

If you have a funded Devnet keypair:

```powershell
$env:DEVNET_RPC_URL = "https://api.devnet.solana.com"
$env:DEVNET_WALLET  = "C:\path\to\funded-devnet-keypair.json"
$env:E2E_RESULT_PATH = "devnet-e2e-result.json"
npx tsx scripts/devnet-e2e.ts
```

The script will use the funded balance and skip the airdrop loop. The same program IDs
are used on Devnet and Mainnet, so the account model is the same. Do not point this at
a Mainnet RPC; the harness throws unless `ALLOW_NON_DEVNET_E2E=true`, and you should
not set that.
