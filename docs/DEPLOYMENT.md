# Deployment

## Published surfaces

| Surface | URL |
| --- | --- |
| Primary site (Vercel) | <https://chillguyrich.fun/> |
| Staking | <https://chillguyrich.fun/staking> |
| Read-only admin | <https://chillguyrich.fun/staking/admin> |
| `www` | <https://www.chillguyrich.fun/> → 308 → apex |
| GitHub Pages mirror | <https://shitoshisol-arch.github.io/CARTOONAI-PEOJECT23/> |

Both hosts serve the same build. The Vercel project is `chill106` under the
`boost1connects-projects` team; the custom domain is attached to that project.

The Vercel build is configured with the **Devnet test pool** so `/staking` is live and
testable. The GitHub Pages mirror still has no production env values and therefore
shows `AWAITING POOL CONFIGURATION`. That is expected.

## Vercel environment

Production variables currently set on `chill106`:

| Variable | Value / purpose |
| --- | --- |
| `VITE_SOLANA_CLUSTER` | `devnet` |
| `VITE_TOKEN_MINT` | test mint `6ztfGd4EebntaSWQyg4hkHNfA2xJ5qEuWFrBXP1RGoYj` |
| `VITE_STAKE_POOL` | `GPS47aw7LQwCmgUTLTYDs1cX6Eptji6YXoVNvkYjUzdb` |
| `VITE_REWARD_POOL` | `C7aEa7FF5G7tDwmpQdzAg79Ro2nnEswzYbrFFzhsRp5y` |
| `VITE_TOKEN_DECIMALS` | `8` |
| `VITE_STAKE_DURATION_DAYS` | `1` |
| `VITE_TARGET_APY` | `19` (display target) |
| `VITE_STAKE_CAP` | `1000` |
| `VITE_REWARD_ALLOCATION` | `100` |
| `VITE_TEST_FAUCET` | `true` (Devnet-only) |
| `TEST_MINT` | test mint (server-side) |
| `TEST_MINT_AUTHORITY` | test mint authority keypair (Vercel secret) |
| `TEST_RPC_URL` | `https://api.devnet.solana.com` |

`TEST_MINT_AUTHORITY` is a secret and is never committed. The authority controls only
the disposable Devnet test mint. See [`DEVNET_TEST_POOL.md`](DEVNET_TEST_POOL.md).

## Vercel setup

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Production domain | `chillguyrich.fun` |
| `www` | 308 redirect to `chillguyrich.fun` |

`vercel.json` supplies the SPA rewrite (`/(.*)` → `/index.html`) and a small set of
security headers. Direct visits to `/staking` and `/staking/admin` return HTTP 200 and
render the React app, not a 404.

`chillguyrich.fun` uses Vercel DNS (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) and was
already registered to this Vercel account before this deployment. Adding the domain to
the project was enough; no registrar transfer was needed. `www` is a CNAME to the apex
and is assigned to the project as a 308 redirect.

Deployment Protection is set to `all_except_custom_domains`. Preview and raw
`*.vercel.app` URLs require Vercel authentication, while the custom domain is public.
That is why the domain returns 200 in an ordinary browser.

### Redeploying

```bash
npx vercel@latest --prod --scope boost1connects-projects
```

The directory is linked to `chill106` through `.vercel/project.json` (gitignored).

### Git auto-deploy

Vercel's GitHub integration is **not connected**. The publishing repository lives under
a GitHub account the Vercel GitHub App cannot link to:

```text
Failed to connect the GitHub repository ... You need admin or write access ... (400)
```

Two supported ways to finish that later:

1. Install the Vercel GitHub App on the repository owner's account, then run
   `npx vercel@latest git connect https://github.com/<owner>/CARTOONAI-PEOJECT23.git`.
2. Add a project-scoped `VERCEL_TOKEN` as a GitHub Actions secret and deploy from CI.
   The current team role cannot create new tokens, so this was not enabled.

Until one of those is done, use the redeploy command above after pushing.

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

Add them in Vercel under **Project → Settings → Environment Variables**, then redeploy.
Every `VITE_*` value is public in the browser bundle. Never put a secret or private key
in one. Keep `VITE_MAINNET_WRITES=false` until
[`MAINNET_REPORT_TEMPLATE.md`](MAINNET_REPORT_TEMPLATE.md) is signed off.

## GitHub Pages mirror

`.github/workflows/deploy-pages.yml` builds with:

```text
VITE_BASE=/CARTOONAI-PEOJECT23/
```

`vite.config.ts` reads `VITE_BASE` (default `/`), and `src/App.tsx` derives the router
basename from `import.meta.env.BASE_URL`. Vercel builds with the default `/`.

GitHub Pages has no SPA rewrite rules, so the workflow copies the entry point to
`dist/404.html`, `dist/staking/index.html`, and `dist/staking/admin/index.html`.
Vercel does not need those copies because `vercel.json` rewrites routes.

## Install reproducibility

`.npmrc` sets `legacy-peer-deps=true`. The Solana wallet-adapter stack pulls a nested
React Native tree that asks for `@types/react@19`; with React 18 this otherwise creates
two React type identities and breaks JSX compilation on a clean CI install. The
lockfile is generated with npm 10 (the version shipped with Node 20) so `npm ci` works
on both the Pages runner and Vercel.

## Not covered

- No automatic Git-to-Vercel deployment yet (see above).
- No DNS or registrar transfer; the domain stays on Vercel DNS.
- Vercel provides HSTS and the configured headers, but there is no full CSP yet.
- No secrets, RPC key, or private key are stored in the repository or the bundle.
