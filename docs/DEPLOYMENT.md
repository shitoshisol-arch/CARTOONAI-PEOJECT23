# Deployment

## Published preview

| Surface | URL |
| --- | --- |
| Home | <https://shitoshisol-arch.github.io/CARTOONAI-PEOJECT23/> |
| Staking | <https://shitoshisol-arch.github.io/CARTOONAI-PEOJECT23/staking/> |
| Read-only admin | <https://shitoshisol-arch.github.io/CARTOONAI-PEOJECT23/staking/admin/> |

Host: GitHub Pages project site. Build and deploy run in
`.github/workflows/deploy-pages.yml` on every push to `main`.

The preview is built **without** production pool values, so `/staking` deliberately
renders `AWAITING POOL CONFIGURATION`. That is the honest state: no mint address or
pool has been published yet.

## Why `VITE_BASE` exists

GitHub Pages serves project sites under `/<repo>/`. Vite therefore builds with:

```text
VITE_BASE=/CARTOONAI-PEOJECT23/
```

`vite.config.ts` reads `VITE_BASE` (default `/`), and `src/App.tsx` derives the
router basename from `import.meta.env.BASE_URL`. For a custom domain or a root
deployment, set `VITE_BASE=/`.

## Direct-route fallback

GitHub Pages has no SPA rewrite rules. The workflow copies the built entry point to:

```text
dist/404.html
dist/staking/index.html
dist/staking/admin/index.html
```

Known routes therefore return the app with HTTP 200, and unknown paths get the app's
own `NotFound` screen through `404.html`. No client-side redirect hack is used.

## Building with a live pool

Supply env values at build time, never at runtime:

```dotenv
VITE_SOLANA_CLUSTER=mainnet-beta
VITE_TOKEN_MINT=<verified mint>
VITE_STAKE_POOL=<stake pool PDA>
VITE_REWARD_POOL=<fixed reward pool PDA>
VITE_TOKEN_DECIMALS=8
VITE_STAKE_DURATION_DAYS=182
VITE_TARGET_APY=19
VITE_STAKE_CAP=90
VITE_REWARD_ALLOCATION=10
VITE_MAINNET_WRITES=false
```

Every `VITE_*` value is public in the browser bundle. Never put a secret or private
key in one. Keep `VITE_MAINNET_WRITES=false` until
[`MAINNET_REPORT_TEMPLATE.md`](MAINNET_REPORT_TEMPLATE.md) is signed off.

For GitHub Pages, add those values as repository **Actions variables** and reference
them in the workflow's Build step. Do not commit `.env.local`.

## Install reproducibility

`.npmrc` sets `legacy-peer-deps=true`. The Solana wallet-adapter stack pulls a nested
React Native tree that asks for `@types/react@19`; with React 18 this otherwise
creates two React type identities and breaks JSX compilation on a clean CI install.
The lockfile is generated with npm 10 (the version shipped with Node 20) so `npm ci`
matches the Pages runner.

## Redeploying

```bash
git push publish main
gh run watch --repo shitoshisol-arch/CARTOONAI-PEOJECT23
```

`origin` still points at the original `html-crm/CARTOONAI-PEOJECT23` repository. This
machine's GitHub credential has read-only access there, so pushes are rejected. When
write access is granted, push the same `main` branch to `origin` and either keep the
mirror or move Pages to the original repository.

## Not covered

- This is a static preview, not a production domain with DNS/TLS ownership.
- GitHub Pages has no server headers, so CSP/HSTS must be set at a proxy or host.
- No secrets, no RPC key and no private key are stored in the repository or the bundle.
