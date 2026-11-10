import { Link } from "react-router-dom";
import {
  APP,
  CLUSTER_LABEL,
  CONFIG_MISSING,
  CONFIG_READY,
  MAX_REWARD_ALLOCATION,
  STAKE_DURATION_DAYS,
  STREAMFLOW_DOCS,
  TARGET_APY,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
  explorerAddressUrl,
} from "../lib/config";
import {
  formatAmount,
  formatDateTime,
  formatDuration,
  formatPercent,
  shortKey,
} from "../lib/format";
import { useAdminData } from "../hooks/useStakingData";
import {
  CopyValue,
  Notice,
  Panel,
  PanelHead,
  StatCell,
  StatusChip,
} from "../components/ui";

export function Admin() {
  const { snapshot, loading, error, lastSync, refresh } = useAdminData();

  return (
    <div className="shell py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-ice" />
          ADMIN CONSOLE // READ ONLY
        </span>
        <span>SOLANA / {CLUSTER_LABEL} / NO SIGNING</span>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="hud-label text-ice">FILE 106 // OPERATIONS RECORD</div>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            PROTOCOL
            <span className="text-ice"> MONITOR</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            Aggregate pool state read directly from the deployed Streamflow programs.
            This console cannot change reward parameters, pause the pool, confiscate
            principal, or withdraw user funds. No admin instruction is connected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="neutral">READ ONLY</StatusChip>
          <button
            className="btn-outline px-4 py-2.5 text-[10px]"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "SYNCING…" : "REFRESH SNAPSHOT"}
          </button>
          <Link to={APP.route} className="btn-outline px-4 py-2.5 text-[10px]">
            STAKING TERMINAL ↗
          </Link>
        </div>
      </div>

      {!CONFIG_READY ? (
        <div className="mt-8">
          <Notice tone="warn" label="POOL NOT CONFIGURED">
            The admin console has no pool to read. Missing:{" "}
            {CONFIG_MISSING.length ? CONFIG_MISSING.join(", ") : "pool lookup failed"}.
            Configure the mint and stake pool environment variables first.
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mt-6">
          <Notice tone="danger" label="READ ERROR">
            {error}
          </Notice>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className="mt-8 grid gap-px border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
            <OverviewCell
              label="TOTAL DEPOSITED EVER"
              value={`${formatAmount(snapshot.totalDepositedEver, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`}
            />
            <OverviewCell
              label="CURRENT PRINCIPAL"
              value={`${formatAmount(snapshot.totalStaked, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`}
            />
            <OverviewCell label="UNIQUE WALLETS" value={String(snapshot.uniqueWallets)} />
            <OverviewCell
              label="POOL STATUS"
              value={snapshot.pool.status}
              tone={snapshot.pool.status === "LIVE" ? "ok" : "warn"}
            />
            <OverviewCell label="ACTIVE LOCKS" value={String(snapshot.activePositions)} />
            <OverviewCell
              label="EXPIRED / UNLOCKED"
              value={String(snapshot.unlockedPositions)}
            />
            <OverviewCell
              label="CLOSED ENTRIES"
              value={String(snapshot.completedPositions)}
            />
            <OverviewCell
              label="LAST SYNC"
              value={
                lastSync
                  ? new Date(lastSync).toLocaleTimeString("en-GB", { hour12: false })
                  : "—"
              }
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHead
                label="REWARD ACCOUNTING"
                right={
                  <StatusChip
                    tone={
                      snapshot.rewardReserve.lt(snapshot.rewardFunded)
                        ? "warn"
                        : "live"
                    }
                  >
                    FIXED POOL
                  </StatusChip>
                }
              />
              <div className="grid grid-cols-2 gap-px bg-white/[0.07]">
                <StatCell
                  label="FUNDED"
                  value={formatAmount(snapshot.rewardFunded, TOKEN_DECIMALS)}
                  sub={TOKEN_SYMBOL}
                />
                <StatCell
                  label="CLAIMED"
                  value={formatAmount(snapshot.rewardClaimed, TOKEN_DECIMALS)}
                  sub={TOKEN_SYMBOL}
                />
                <StatCell
                  label="VAULT RESERVE"
                  value={formatAmount(snapshot.rewardReserve, TOKEN_DECIMALS)}
                  sub="ACTUAL TOKEN BALANCE"
                  accent
                />
                <StatCell
                  label="IMPLIED APR"
                  value={formatPercent(snapshot.pool.impliedApr, 2)}
                  sub="ON-CHAIN PARAMETERS"
                />
              </div>
              <div className="border-t border-white/[0.07] px-4 py-3 font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-dim">
                FUNDED / CLAIMED ARE ACCOUNTING VALUES. THE VAULT RESERVE IS THE LIVE
                TOKEN BALANCE AVAILABLE TO PAY CLAIMS.
              </div>
            </Panel>

            <Panel>
              <PanelHead label="POOL PARAMETERS" title="ON-CHAIN CONFIGURATION" />
              <div className="grid grid-cols-2 gap-px bg-white/[0.07]">
                <StatCell
                  label="TARGET APY // CONFIG"
                  value={formatPercent(TARGET_APY, 2)}
                  sub="NOT AN ON-CHAIN FIELD"
                />
                <StatCell
                  label="REWARD BUDGET // CONFIG"
                  value={`${MAX_REWARD_ALLOCATION} ${TOKEN_SYMBOL}`}
                  sub="ALLOCATION"
                />
                <StatCell label="TERM // CONFIG" value={`${STAKE_DURATION_DAYS}D`} sub="ADVERTISED" />
                <StatCell
                  label="POOL TERM RANGE"
                  value={`${formatDuration(snapshot.pool.pool.minDuration)} → ${formatDuration(
                    snapshot.pool.pool.maxDuration,
                  )}`}
                  sub="MIN → MAX"
                />
                <StatCell
                  label="MAX WEIGHT"
                  value={`${(snapshot.pool.pool.maxWeight.toNumber() / 1_000_000_000).toFixed(2)}×`}
                  sub="WEIGHT CAP"
                />
                <StatCell
                  label="EXPIRY"
                  value={
                    snapshot.pool.pool.expiryTs.gtn(0)
                      ? formatDateTime(snapshot.pool.pool.expiryTs)
                      : "NONE"
                  }
                  sub="UTC"
                />
              </div>
              <div className="space-y-2 border-t border-white/[0.07] px-4 py-3">
                <CopyValue
                  label="POOL"
                  value={snapshot.pool.poolAddress}
                  display={shortKey(snapshot.pool.poolAddress, 8, 8)}
                />
                <CopyValue
                  label="MINT"
                  value={snapshot.pool.tokenMeta.address}
                  display={shortKey(snapshot.pool.tokenMeta.address, 8, 8)}
                />
                <CopyValue
                  label="AUTHORITY"
                  value={snapshot.pool.pool.authority.toBase58()}
                  display={shortKey(snapshot.pool.pool.authority.toBase58(), 8, 8)}
                />
              </div>
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHead label="AUTHORITY POWERS // DISCLOSURE" />
              <ul className="divide-y divide-white/[0.055]">
                {[
                  [
                    "CAN CHANGE AUTHORITY",
                    "The current authority can transfer pool control to another key.",
                  ],
                  [
                    "CAN UPDATE FUTURE REWARDS",
                    "rewardAmount and rewardPeriod can be changed. Existing entries retain their accounted history, but future accrual can change.",
                  ],
                  [
                    "CAN CLAWBACK LEFTOVERS",
                    "After pool expiry plus the program delay, unspent fixed rewards can be returned to the authority.",
                  ],
                  [
                    "CANNOT TAKE PRINCIPAL",
                    "The Streamflow stake program has no authority instruction that moves staked principal out of the pool vault to the authority.",
                  ],
                  [
                    "CANNOT EDIT LOCKS",
                    "A user's stake duration is recorded in the stake entry and is not shortened by this console.",
                  ],
                ].map(([title, body]) => (
                  <li key={title} className="px-4 py-3">
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ice">
                      {title}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">{body}</p>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelHead label="DEPLOYED PROGRAMS" />
              <div className="space-y-3 px-4 py-4">
                {[
                  ["STAKE POOL", snapshot.pool.programs.stakePool],
                  ["FIXED REWARD POOL", snapshot.pool.programs.rewardPool],
                  ["DYNAMIC REWARD POOL", snapshot.pool.programs.rewardPoolDynamic],
                  ["FEE MANAGER", snapshot.pool.programs.feeManager],
                ].map(([label, address]) => (
                  <div key={label}>
                    <div className="hud-micro">{label}</div>
                    <a
                      className="mt-1 block truncate font-mono text-[9px] text-ink/80 transition-colors hover:text-ice"
                      href={explorerAddressUrl(address)}
                      target="_blank"
                      rel="noreferrer"
                      title={address}
                    >
                      {address} ↗
                    </a>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/[0.07] px-4 py-3">
                <a
                  className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-acid"
                  href={STREAMFLOW_DOCS.security}
                  target="_blank"
                  rel="noreferrer"
                >
                  STREAMFLOW SECURITY MODEL ↗
                </a>
              </div>
            </Panel>
          </div>

          <div className="mt-6">
            <Notice tone="info" label="NO ADMIN WRITES">
              This page is a read-only monitor. There are no buttons to update rewards,
              pause staking, claw back rewards, or move principal. Any future admin
              action would require a separate, reviewed transaction tool and explicit
              authority-key approval.
            </Notice>
          </div>
        </>
      ) : CONFIG_READY && loading ? (
        <div className="mt-10 border border-white/[0.08] px-5 py-10 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
          READING PROTOCOL SNAPSHOT…
        </div>
      ) : null}
    </div>
  );
}

function OverviewCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="bg-[#080b10] px-4 py-4">
      <div className="hud-micro">{label}</div>
      <div
        className={`mt-1.5 font-display text-lg font-medium tracking-tight sm:text-xl ${
          tone === "ok" ? "text-ok" : tone === "warn" ? "text-amber" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
