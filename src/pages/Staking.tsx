import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import BN from "bn.js";
import { Link } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  APP,
  CLUSTER_LABEL,
  CONFIG_MISSING,
  CONFIG_READY,
  IS_MAINNET,
  MAX_REWARD_ALLOCATION,
  MAX_STAKE_CAP,
  REWARD_POOL_TYPE,
  STAKE_DURATION_DAYS,
  STREAMFLOW_DOCS,
  STREAMFLOW_PROGRAM_IDS,
  TARGET_APY,
  TOKEN_DECIMALS,
  TOKEN_MINT,
  TOKEN_SYMBOL,
  WRITE_ENABLED,
  explorerAddressUrl,
  explorerTxUrl,
  writeLockReason,
} from "../lib/config";
import {
  SECONDS_PER_DAY,
  ZERO,
  formatAmount,
  formatAmountFixed,
  formatCountdown,
  formatDate,
  formatDateTime,
  formatDuration,
  formatLamports,
  formatPercent,
  parseAmount,
  percentOf,
  pow10,
  shortKey,
} from "../lib/format";
import {
  auditEconomics,
  deliveredApr,
  projectRewards,
  type RewardProjection,
} from "../lib/economics";
import { useStakingData } from "../hooks/useStakingData";
import { getStakingClient } from "../lib/streamflow/client";
import {
  describeError,
  executeInstructions,
  findFreeStakeNonce,
  prepareClaimAction,
  prepareStakeAction,
  prepareUnstakeAction,
  previewInstructions,
  type PreparedAction,
  type TxPreview,
} from "../lib/streamflow/actions";
import type {
  PoolSnapshot,
  UserEntrySnapshot,
  UserSnapshot,
} from "../lib/streamflow/reads";
import {
  appendActivity,
  loadActivity,
  type ActivityRecord,
  type ActivityType,
} from "../lib/activity";
import {
  CopyValue,
  Modal,
  Notice,
  Panel,
  PanelHead,
  ProgressBar,
  StatCell,
  StatusChip,
  type StatusTone,
} from "../components/ui";
import { WalletButton } from "../components/wallet/WalletButton";
import { TestTokensPanel } from "../components/staking/TestTokensPanel";
import { useWalletUI } from "../components/wallet/WalletUI";

interface ReviewState {
  kind: ActivityType;
  title: string;
  detail: string;
  amount: BN;
  entry?: UserEntrySnapshot;
  prepared: PreparedAction;
  preview: TxPreview;
}

interface SuccessState {
  signature: string;
  kind: ActivityType;
}

const STAKE_TITLE = "STAKE FILE";

export function Staking() {
  const { connection } = useConnection();
  const { publicKey, wallet } = useWallet();
  const { openModal } = useWalletUI();
  const {
    pool,
    user,
    loading,
    error: dataError,
    lastSync,
    refresh,
  } = useStakingData();

  const [amountInput, setAmountInput] = useState("");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [preparingKey, setPreparingKey] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);

  const walletAddress = publicKey?.toBase58() ?? null;

  useEffect(() => {
    setActivity(loadActivity(walletAddress));
  }, [walletAddress]);

  const audit = useMemo(
    () =>
      auditEconomics(
        TARGET_APY,
        MAX_STAKE_CAP,
        MAX_REWARD_ALLOCATION,
        STAKE_DURATION_DAYS,
      ),
    [],
  );

  const capRaw = useMemo(
    () => new BN(Math.round(MAX_STAKE_CAP).toString()).mul(pow10(TOKEN_DECIMALS)),
    [],
  );

  const desiredTerm = STAKE_DURATION_DAYS * SECONDS_PER_DAY;
  const termSeconds = useMemo(() => {
    if (!pool) return desiredTerm;
    const min = pool.pool.minDuration.toNumber();
    const max = pool.pool.maxDuration.toNumber();
    return Math.min(Math.max(desiredTerm, min), max);
  }, [pool, desiredTerm]);

  const termClamped = useMemo(() => {
    if (!pool) return false;
    const min = pool.pool.minDuration.toNumber();
    const max = pool.pool.maxDuration.toNumber();
    return desiredTerm < min || desiredTerm > max;
  }, [pool, desiredTerm]);

  const parsed = useMemo(
    () => parseAmount(amountInput, TOKEN_DECIMALS),
    [amountInput],
  );

  const projection = useMemo(() => {
    if (!pool?.rewardPool || !parsed.ok || !parsed.value) return null;
    if (pool.rewardPool.account.rewardPeriod.isZero()) return null;
    return projectRewards({
      amount: parsed.value,
      duration: new BN(termSeconds),
      minDuration: pool.pool.minDuration,
      maxDuration: pool.pool.maxDuration,
      maxWeight: pool.pool.maxWeight,
      rewardAmount: pool.rewardPool.account.rewardAmount,
      rewardPeriod: pool.rewardPool.account.rewardPeriod,
    });
  }, [pool, parsed, termSeconds]);

  const stakeIssue = useMemo(() => {
    if (!publicKey) return "CONNECT A WALLET TO OPEN A POSITION";
    if (!WRITE_ENABLED) return writeLockReason() ?? "WRITES DISABLED";
    if (!pool) return "POOL DATA HAS NOT LOADED";
    if (!user) return "POSITION STILL LOADING";
    if (pool.status === "EXPIRED") return "POOL EXPIRED — STAKING IS CLOSED";
    if (pool.status === "FULL") return "CAPACITY EXHAUSTED";
    if (!parsed.ok) return parsed.error ?? "INVALID AMOUNT";
    if (!parsed.value) return "INVALID AMOUNT";
    if (parsed.value.gt(pool.capacityRemaining)) {
      return "AMOUNT EXCEEDS REMAINING CAPACITY";
    }
    if (user && parsed.value.gt(user.tokenBalance)) {
      return `AMOUNT EXCEEDS WALLET BALANCE (${formatAmount(
        user.tokenBalance,
        TOKEN_DECIMALS,
      )} ${TOKEN_SYMBOL})`;
    }
    if (user && parsed.value.isZero()) return "AMOUNT MUST BE GREATER THAN ZERO";
    return null;
  }, [publicKey, pool, parsed, user]);

  const openReview = useCallback(
    async (
      kind: ActivityType,
      title: string,
      detail: string,
      amount: BN,
      entry: UserEntrySnapshot | undefined,
      prepare: () => Promise<PreparedAction>,
    ) => {
      if (!publicKey) {
        openModal();
        return;
      }
      const key = entry ? `${kind}:${entry.address}` : kind;
      setPreparingKey(key);
      setFlowError(null);
      setReviewError(null);
      try {
        const prepared = await prepare();
        const preview = await previewInstructions(
          connection,
          publicKey,
          prepared.ixs,
          prepared.ataRentLamports,
        );
        setReview({ kind, title, detail, amount, entry, prepared, preview });
      } catch (prepareError) {
        setFlowError(describeError(prepareError));
      } finally {
        setPreparingKey(null);
      }
    },
    [connection, openModal, publicKey],
  );

  const handleReviewStake = useCallback(() => {
    if (!pool || !parsed.ok || !parsed.value || !publicKey || stakeIssue) return;
    const amount = parsed.value;
    void openReview(
      "STAKE",
      STAKE_TITLE,
      `${formatAmount(amount, TOKEN_DECIMALS)} ${TOKEN_SYMBOL} LOCKED FOR ${formatDuration(
        termSeconds,
      )}`,
      amount,
      undefined,
      async () => {
        const client = getStakingClient();
        const nonce = await findFreeStakeNonce(
          client,
          connection,
          new PublicKey(pool.poolAddress),
          publicKey,
        );
        return prepareStakeAction({
          client,
          connection,
          poolSnapshot: pool,
          wallet: publicKey,
          adapter: wallet?.adapter ?? null,
          amount,
          duration: new BN(termSeconds),
          nonce,
        });
      },
    );
  }, [
    connection,
    openReview,
    parsed,
    pool,
    publicKey,
    stakeIssue,
    termSeconds,
    wallet,
  ]);

  const handleReviewClaim = useCallback(
    (entry: UserEntrySnapshot) => {
      if (!pool) return;
      void openReview(
        "CLAIM",
        "CLAIM REWARDS",
        `${formatAmount(entry.pendingRewards, TOKEN_DECIMALS)} ${TOKEN_SYMBOL} ESTIMATED CLAIMABLE`,
        entry.pendingRewards,
        entry,
        async () =>
          prepareClaimAction({
            client: getStakingClient(),
            connection,
            poolSnapshot: pool,
            wallet: publicKey as PublicKey,
            adapter: wallet?.adapter ?? null,
            entry,
          }),
      );
    },
    [connection, openReview, pool, publicKey, wallet],
  );

  const handleReviewUnstake = useCallback(
    (entry: UserEntrySnapshot, mode: "claim" | "emergency") => {
      if (!pool || !publicKey) return;
      const emergency = mode === "emergency";
      void openReview(
        emergency ? "EMERGENCY_UNSTAKE" : "UNSTAKE",
        emergency ? "EMERGENCY UNSTAKE" : "UNSTAKE + CLAIM",
        emergency
          ? `${formatAmount(entry.amount, TOKEN_DECIMALS)} ${TOKEN_SYMBOL} RETURNED // UNCLAIMED REWARDS FORFEITED`
          : `${formatAmount(entry.amount, TOKEN_DECIMALS)} ${TOKEN_SYMBOL} RETURNED + REWARDS CLAIMED`,
        entry.amount,
        entry,
        async () =>
          prepareUnstakeAction({
            client: getStakingClient(),
            connection,
            poolSnapshot: pool,
            wallet: publicKey,
            adapter: wallet?.adapter ?? null,
            entry,
            mode,
          }),
      );
    },
    [connection, openReview, pool, publicKey, wallet],
  );

  const handleExecute = useCallback(async () => {
    if (!review || review.preview.error || !publicKey) return;
    setExecuting(true);
    setReviewError(null);
    try {
      const signature = await executeInstructions(
        getStakingClient(),
        review.prepared.ixs,
        wallet?.adapter ?? null,
      );
      const nextActivity = appendActivity(publicKey.toBase58(), {
        signature,
        type: review.kind,
        amountRaw: review.amount.toString(),
        symbol: TOKEN_SYMBOL,
        timestamp: Date.now(),
        status: "CONFIRMED",
      });
      setActivity(nextActivity);
      setSuccess({ signature, kind: review.kind });
      setReview(null);
      setAmountInput("");
      await refresh();
    } catch (executeError) {
      setReviewError(describeError(executeError));
    } finally {
      setExecuting(false);
    }
  }, [publicKey, refresh, review, wallet]);

  const maxAmount = useMemo(() => {
    if (!pool) return null;
    const balance = user?.tokenBalance ?? ZERO;
    const cap = pool.capacityRemaining;
    if (balance.isZero() && cap.isZero()) return ZERO;
    return BN.min(balance, cap);
  }, [pool, user]);

  return (
    <>
      <StakingHero
        pool={pool}
        loading={loading}
        lastSync={lastSync}
        connected={Boolean(publicKey)}
      />

      <div className="shell pb-24">
        {!CONFIG_READY ? (
          <ConfigGate dataError={dataError} audit={audit} />
        ) : (
          <div className="space-y-6">
            {dataError ? (
              <Notice tone="danger" label="CHAIN READ FAILED">
                {dataError}
                <div className="mt-2">
                  <button className="btn-outline px-3 py-2" onClick={() => void refresh()}>
                    RETRY READ
                  </button>
                </div>
              </Notice>
            ) : null}

            {!loading && !pool ? (
              <Notice tone="warn" label="POOL NOT LOADED">
                The configured stake pool could not be decoded. Check the pool address,
                cluster, and RPC endpoint before enabling writes.
              </Notice>
            ) : null}

            {pool ? (
              <>
                <TestTokensPanel
                  connected={Boolean(publicKey)}
                  walletAddress={walletAddress}
                  onClaimed={() => void refresh()}
                />

                <PoolVitals pool={pool} capacityProgress={percentOf(pool.pool.totalStake, capRaw)} />

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="space-y-6">
                    <StakeConsole
                      pool={pool}
                      user={user}
                      amountInput={amountInput}
                      onAmountChange={setAmountInput}
                      onMax={() => {
                        if (!maxAmount) return;
                        setAmountInput(
                          formatAmount(maxAmount, TOKEN_DECIMALS, TOKEN_DECIMALS),
                        );
                      }}
                      parsedOk={parsed.ok}
                      parsedError={parsed.error}
                      projection={projection}
                      termSeconds={termSeconds}
                      termClamped={termClamped}
                      issue={stakeIssue}
                      connected={Boolean(publicKey)}
                      onConnect={openModal}
                      onReview={handleReviewStake}
                      preparing={preparingKey === "STAKE"}
                    />

                    <PositionsPanel
                      user={user}
                      connected={Boolean(publicKey)}
                      loading={loading}
                      preparingKey={preparingKey}
                      onClaim={handleReviewClaim}
                      onUnstake={handleReviewUnstake}
                      onConnect={openModal}
                    />

                    <ActivityPanel
                      activity={activity}
                      connected={Boolean(publicKey)}
                      onRefresh={() => setActivity(loadActivity(walletAddress))}
                    />
                  </div>

                  <div className="space-y-6">
                    <WalletPanel
                      user={user}
                      connected={Boolean(publicKey)}
                      loading={loading}
                      lastSync={lastSync}
                      onConnect={openModal}
                      onRefresh={() => void refresh()}
                    />

                    <EconomicsPanel pool={pool} audit={audit} capRaw={capRaw} />

                    <ProtocolPanel pool={pool} />

                    <RiskPanel />
                  </div>
                </div>
              </>
            ) : null}

            {flowError ? (
              <Notice tone="danger" label="ACTION FAILED">
                {flowError}
              </Notice>
            ) : null}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
            ALL WRITES REQUIRE WALLET APPROVAL // NO CUSTODY // NO GUARANTEE
          </p>
          <Link
            to={APP.adminRoute}
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-acid"
          >
            READ-ONLY ADMIN CONSOLE ↗
          </Link>
        </div>
      </div>

      <ReviewModal
        review={review}
        executing={executing}
        error={reviewError}
        onClose={() => {
          if (!executing) {
            setReview(null);
            setReviewError(null);
          }
        }}
        onConfirm={() => void handleExecute()}
      />

      <SuccessModal success={success} onClose={() => setSuccess(null)} />
    </>
  );
}

function StakingHero({
  pool,
  loading,
  lastSync,
  connected,
}: {
  pool: PoolSnapshot | null;
  loading: boolean;
  lastSync: number | null;
  connected: boolean;
}) {
  const lock = writeLockReason();
  return (
    <section className="relative overflow-hidden border-b border-white/[0.07]">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <div
        className="pointer-events-none absolute -right-10 top-0 select-none font-display text-[26vw] font-bold leading-none text-white/[0.018]"
        aria-hidden="true"
      >
        106
      </div>
      <div className="shell relative pb-10 pt-10 sm:pb-12 sm:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
          <span className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                CONFIG_READY ? "bg-acid animate-pulse-dot" : "bg-amber"
              }`}
            />
            STAKING TERMINAL // {CONFIG_READY ? "POOL LINKED" : "AWAITING CONFIG"}
          </span>
          <span>SOLANA / {CLUSTER_LABEL} / STREAMFLOW CORE</span>
        </div>

        <div className="mt-8 grid items-end gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="animate-fade-up">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="chip border-acid/30 text-acid">NON-CUSTODIAL</span>
              <span className="chip">AUDITED PROGRAMS</span>
              <span className="chip">NO CUSTOM CONTRACT</span>
            </div>
            <h1 className="font-display text-[clamp(3.2rem,8vw,6.8rem)] font-bold leading-[0.86] tracking-[-0.05em]">
              STAKING
              <br />
              <span className="text-acid">TERMINAL</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Lock {TOKEN_SYMBOL} through Streamflow&apos;s deployed Solana programs.
              The chain holds the principal, the duration, and the reward entry. This
              interface only builds and verifies the transaction.
            </p>
          </div>

          <div className="terminal animate-fade-in p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-acid/15 pb-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-acid">
                TERMINAL STATUS
              </span>
              <StatusChip
                tone={CONFIG_READY ? (lock ? "warn" : "live") : "warn"}
              >
                {CONFIG_READY ? (lock ? "READ ONLY" : "WRITES ARMED") : "NO POOL"}
              </StatusChip>
            </div>
            <div className="mt-3 space-y-1">
              <TerminalRow
                label="POOL STATE"
                value={pool ? pool.status : loading ? "READING CHAIN…" : "UNCONFIGURED"}
                accent={Boolean(pool)}
              />
              <TerminalRow
                label="TARGET APY"
                value={`${formatPercent(TARGET_APY, 2)} // CONFIG ONLY`}
              />
              <TerminalRow label="LOCK TERM" value={`${STAKE_DURATION_DAYS} DAYS`} />
              <TerminalRow
                label="LAST SYNC"
                value={
                  lastSync
                    ? new Date(lastSync).toLocaleTimeString("en-GB", { hour12: false })
                    : "—"
                }
              />
              <TerminalRow
                label="WALLET"
                value={connected ? "LINKED" : "NOT LINKED"}
                accent={connected}
              />
            </div>
            <div className="mt-4">
              <WalletButton />
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-px border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
          <HeroStat label="TARGET" value={`${formatPercent(TARGET_APY, 0)}`} sub="CONFIG TARGET" />
          <HeroStat label="TERM" value={`${STAKE_DURATION_DAYS}D`} sub="POOL LOCK" />
          <HeroStat label="CAP" value={formatAmount(capFromConfig(), TOKEN_DECIMALS, 0)} sub={TOKEN_SYMBOL} />
          <HeroStat label="REWARD BUDGET" value={`${MAX_REWARD_ALLOCATION}`} sub={`${TOKEN_SYMBOL} ALLOCATION`} />
        </div>
      </div>
    </section>
  );
}

function capFromConfig(): BN {
  return new BN(Math.round(MAX_STAKE_CAP).toString()).mul(pow10(TOKEN_DECIMALS));
}

function TerminalRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em]">
      <span className="text-acid/60">›</span>
      <span className="text-dim">{label}</span>
      <span className="flex-1 border-b border-dotted border-white/10" />
      <span className={accent ? "text-acid" : "text-ink/85"}>{value}</span>
    </div>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-[#07090d] px-4 py-3">
      <div className="hud-micro">{label}</div>
      <div className="mt-1 font-display text-xl font-medium tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-dim">
        {sub}
      </div>
    </div>
  );
}

function PoolVitals({
  pool,
  capacityProgress,
}: {
  pool: PoolSnapshot;
  capacityProgress: number;
}) {
  const statusTone: StatusTone =
    pool.status === "LIVE" ? "live" : pool.status === "FULL" ? "warn" : "danger";
  const reserve = pool.rewardReserve;
  const rewardPool = pool.rewardPool;
  const rewardPeriod = rewardPool?.account.rewardPeriod;

  return (
    <Panel>
      <PanelHead
        label="POOL VITALS // ON-CHAIN SNAPSHOT"
        right={<StatusChip tone={statusTone}>{pool.status}</StatusChip>}
        title={`${TOKEN_SYMBOL} STAKE POOL`}
      />
      <div className="grid gap-px bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
        <StatCell
          label="IMPLIED APR"
          value={formatPercent(pool.impliedApr, 2)}
          sub="FROM rewardAmount / rewardPeriod"
          accent
        />
        <StatCell
          label="TOTAL PRINCIPAL"
          value={formatAmount(pool.pool.totalStake, TOKEN_DECIMALS)}
          sub={`${TOKEN_SYMBOL} CURRENTLY LOCKED`}
        />
        <StatCell
          label="REMAINING CAPACITY"
          value={formatAmount(pool.capacityRemaining, TOKEN_DECIMALS)}
          sub={pool.pool.isTotalStakeCapped ? "CUMULATIVE // NEVER REFILLS" : "CONFIG CAP"}
        />
        <StatCell
          label="REWARD RESERVE"
          value={formatAmount(reserve, TOKEN_DECIMALS)}
          sub={`${TOKEN_SYMBOL} IN FIXED VAULT`}
          accent={reserve.gt(ZERO)}
        />
        <StatCell
          label="REWARD PER PERIOD"
          value={
            rewardPool
              ? formatAmount(rewardPool.account.rewardAmount, 9, 9)
              : "—"
          }
          sub="PER 1.0x EFFECTIVE TOKEN"
        />
        <StatCell
          label="REWARD PERIOD"
          value={rewardPeriod ? formatDuration(rewardPeriod) : "—"}
          sub="ACCRUAL INTERVAL"
        />
        <StatCell
          label="POOL EXPIRES"
          value={
            pool.pool.expiryTs.gtn(0) ? formatDate(pool.pool.expiryTs) : "NO EXPIRY"
          }
          sub={pool.pool.expiryTs.gtn(0) ? formatDateTime(pool.pool.expiryTs) + " UTC" : "OPEN-ENDED"}
        />
        <StatCell
          label="MAX WEIGHT"
          value={`${(pool.pool.maxWeight.toNumber() / 1_000_000_000).toFixed(2)}×`}
          sub={`${formatDuration(pool.pool.minDuration)} → ${formatDuration(
            pool.pool.maxDuration,
          )}`}
        />
      </div>

      <div className="grid gap-4 border-t border-white/[0.07] px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div className="space-y-2">
          <CopyValue label="POOL" value={pool.poolAddress} display={shortKey(pool.poolAddress, 8, 8)} />
          <CopyValue label="MINT" value={pool.tokenMeta.address} display={shortKey(pool.tokenMeta.address, 8, 8)} />
          <CopyValue
            label="STAKE MINT"
            value={pool.pool.stakeMint.toBase58()}
            display={shortKey(pool.pool.stakeMint.toBase58(), 8, 8)}
          />
        </div>
        <div className="space-y-2">
          <CopyValue
            label="REWARD POOL"
            value={rewardPool?.publicKey.toBase58() ?? "NOT FOUND"}
            display={
              rewardPool ? shortKey(rewardPool.publicKey.toBase58(), 8, 8) : "NOT FOUND"
            }
          />
          <CopyValue
            label="REWARD MINT"
            value={pool.rewardMintMeta?.address ?? "—"}
            display={shortKey(pool.rewardMintMeta?.address, 8, 8)}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="hud-micro shrink-0">MINT CHECK</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ok">
                {pool.tokenMeta.decimals} DECIMALS // SUPPLY{" "}
                {formatAmount(pool.tokenMeta.supply, pool.tokenMeta.decimals, 0)}
              </span>
            </div>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-dim">
              MINT AUTH{" "}
              {pool.tokenMeta.mintAuthority
                ? shortKey(pool.tokenMeta.mintAuthority, 4, 4)
                : "NONE"}{" "}
              // FREEZE{" "}
              {pool.tokenMeta.freezeAuthority
                ? shortKey(pool.tokenMeta.freezeAuthority, 4, 4)
                : "NONE"}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.07] px-4 py-3 sm:px-5">
        <ProgressBar
          value={capacityProgress}
          tone={capacityProgress > 92 ? "amber" : "acid"}
          label="CURRENT PRINCIPAL VS CONFIG CAP"
        />
      </div>
    </Panel>
  );
}

function StakeConsole({
  pool,
  user,
  amountInput,
  onAmountChange,
  onMax,
  parsedOk,
  parsedError,
  projection,
  termSeconds,
  termClamped,
  issue,
  connected,
  onConnect,
  onReview,
  preparing,
}: {
  pool: PoolSnapshot;
  user: UserSnapshot | null;
  amountInput: string;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  parsedOk: boolean;
  parsedError?: string;
  projection: RewardProjection | null;
  termSeconds: number;
  termClamped: boolean;
  issue: string | null;
  connected: boolean;
  onConnect: () => void;
  onReview: () => void;
  preparing: boolean;
}) {
  const lock = writeLockReason();
  const rewardPeriod = pool.rewardPool?.account.rewardPeriod ?? ZERO;
  const delivered = projection ? deliveredApr(projection) : null;
  const periods = projection?.periods;

  return (
    <Panel>
      <PanelHead
        label="OPEN POSITION // STAKE"
        right={
          <StatusChip tone={lock ? "warn" : pool.status === "LIVE" ? "live" : "danger"}>
            {lock ? "READ ONLY" : pool.status}
          </StatusChip>
        }
        title={`LOCK ${TOKEN_SYMBOL} FOR ${formatDuration(termSeconds)}`}
      />
      <div className="p-4 sm:p-5">
        {lock ? (
          <Notice tone="warn" label="WRITES LOCKED">
            {lock}. Reads, projections, and position data remain available. No
            transaction can be signed from this build until the gate is opened.
          </Notice>
        ) : null}

        {termClamped ? (
          <div className="mb-4">
            <Notice tone="info" label="TERM CLAMPED BY POOL">
              Configured term {STAKE_DURATION_DAYS} days is outside the pool range{" "}
              {formatDuration(pool.pool.minDuration)} →{" "}
              {formatDuration(pool.pool.maxDuration)}. This transaction will use{" "}
              {formatDuration(termSeconds)}. Change the pool or the configuration to
              align the advertised term.
            </Notice>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="hud-label" htmlFor="stake-amount">
            AMOUNT // {TOKEN_SYMBOL}
          </label>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">
            AVAILABLE{" "}
            <span className="text-ink/80">
              {user ? formatAmount(user.tokenBalance, TOKEN_DECIMALS) : "—"}
            </span>
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            id="stake-amount"
            className="term-input min-w-0 flex-1"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amountInput}
            onChange={(event) => onAmountChange(event.target.value)}
            aria-invalid={Boolean(amountInput) && !parsedOk}
          />
          <button className="btn-outline shrink-0 px-4" onClick={onMax} disabled={!user}>
            MAX
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
            {amountInput && !parsedOk ? (
              <span className="text-danger">{parsedError}</span>
            ) : (
              <>REMAINING CAP {formatAmount(pool.capacityRemaining, TOKEN_DECIMALS)} {TOKEN_SYMBOL}</>
            )}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
            TERM {formatDuration(termSeconds)}
          </span>
        </div>

        <div className="mt-4 grid gap-px border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3">
          <ProjectionCell
            label="EST. REWARDS"
            value={
              projection
                ? `${formatAmountFixed(projection.total, TOKEN_DECIMALS, 6)} ${TOKEN_SYMBOL}`
                : "—"
            }
            sub="ON-CHAIN FORMULA"
          />
          <ProjectionCell
            label="DELIVERED OVER TERM"
            value={delivered !== null ? formatPercent(delivered, 2) : "—"}
            sub="ANNUALIZED, NOT A PROMISE"
          />
          <ProjectionCell
            label="ACCRUAL PERIODS"
            value={periods ? periods.toString() : "—"}
            sub={rewardPeriod.isZero() ? "NO REWARD POOL" : formatDuration(rewardPeriod)}
          />
        </div>

        <p className="mt-3 font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-dim">
          ESTIMATES USE <span className="text-ink/80">effective = amount × weight</span>{" "}
          AND THE LIVE REWARD POOL. CLAIMABLE REWARDS ARE ALWAYS RECALCULATED FROM THE
          REWARD ENTRY. THE TARGET APY IS NOT AN ON-CHAIN FIELD.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          {!connected ? (
            <button className="btn-primary px-6 py-3.5" onClick={onConnect}>
              CONNECT WALLET
            </button>
          ) : (
            <button
              className="btn-primary px-6 py-3.5"
              onClick={onReview}
              disabled={Boolean(issue) || preparing}
            >
              {preparing ? "SIMULATING…" : "REVIEW STAKE TRANSACTION"}
            </button>
          )}
          <span className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-dim">
            TWO STEPS // SIMULATE, THEN SIGN
          </span>
        </div>

        {issue && connected ? (
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-amber">
            {issue}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function ProjectionCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub: string;
}) {
  return (
    <div className="bg-[#080b10] px-4 py-3">
      <div className="hud-micro">{label}</div>
      <div className="mt-1 font-display text-base font-medium tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-dim">
        {sub}
      </div>
    </div>
  );
}

function WalletPanel({
  user,
  connected,
  loading,
  lastSync,
  onConnect,
  onRefresh,
}: {
  user: UserSnapshot | null;
  connected: boolean;
  loading: boolean;
  lastSync: number | null;
  onConnect: () => void;
  onRefresh: () => void;
}) {
  return (
    <Panel>
      <PanelHead
        label="SIGNER POSITION"
        right={
          <button
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim transition-colors hover:text-acid"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "SYNC…" : "REFRESH"}
          </button>
        }
      />
      {!connected ? (
        <div className="p-5">
          <p className="font-mono text-[10px] leading-relaxed text-muted">
            No signer linked. Connect Phantom or another compatible Solana wallet to
            read your positions and open a stake.
          </p>
          <button className="btn-outline mt-4 w-full" onClick={onConnect}>
            CONNECT WALLET
          </button>
        </div>
      ) : !user ? (
        <div className="p-5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          {loading ? "READING WALLET POSITION…" : "POSITION UNAVAILABLE"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-white/[0.07]">
            <StatCell
              label="BALANCE"
              value={formatAmount(user.tokenBalance, TOKEN_DECIMALS)}
              sub={TOKEN_SYMBOL}
            />
            <StatCell
              label="STAKED"
              value={formatAmount(user.totalStaked, TOKEN_DECIMALS)}
              sub={`${user.activeEntries.length} ACTIVE`}
              accent={user.totalStaked.gt(ZERO)}
            />
            <StatCell
              label="PENDING REWARDS"
              value={formatAmount(user.pendingRewards, TOKEN_DECIMALS)}
              sub={TOKEN_SYMBOL}
              accent={user.pendingRewards.gt(ZERO)}
            />
            <StatCell
              label="RECEIPT TOKENS"
              value={formatAmount(user.receiptBalance, TOKEN_DECIMALS)}
              sub="sTOKEN BALANCE"
            />
          </div>
          <div className="px-4 py-3">
            <CopyValue
              label="WALLET"
              value={user.wallet}
              display={shortKey(user.wallet, 8, 8)}
            />
            <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-dim">
              LAST SYNC{" "}
              {lastSync
                ? new Date(lastSync).toLocaleTimeString("en-GB", { hour12: false })
                : "—"}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function PositionsPanel({
  user,
  connected,
  loading,
  preparingKey,
  onClaim,
  onUnstake,
  onConnect,
}: {
  user: UserSnapshot | null;
  connected: boolean;
  loading: boolean;
  preparingKey: string | null;
  onClaim: (entry: UserEntrySnapshot) => void;
  onUnstake: (entry: UserEntrySnapshot, mode: "claim" | "emergency") => void;
  onConnect: () => void;
}) {
  const entries = user?.entries ?? [];
  return (
    <Panel>
      <PanelHead
        label="POSITION REGISTER"
        right={
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
            {entries.length} RECORD{entries.length === 1 ? "" : "S"}
          </span>
        }
        title="LOCKED FILES // REWARD ENTRIES"
      />
      {!connected ? (
        <div className="p-5">
          <p className="font-mono text-[10px] leading-relaxed text-muted">
            Connect a wallet to read stake entries and reward entries directly from the
            Streamflow programs.
          </p>
          <button className="btn-outline mt-4" onClick={onConnect}>
            CONNECT WALLET
          </button>
        </div>
      ) : loading && !user ? (
        <div className="p-5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          READING POSITIONS…
        </div>
      ) : entries.length === 0 ? (
        <div className="p-5">
          <div className="border border-dashed border-white/10 px-4 py-8 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
              NO POSITIONS ON RECORD
            </div>
            <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-muted">
              A position appears here after a confirmed stake transaction. Closed
              entries remain visible until the program closes the account.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base min-w-[780px]">
            <thead>
              <tr>
                <th>ENTRY</th>
                <th>AMOUNT</th>
                <th>UNLOCK</th>
                <th>STATUS</th>
                <th>PENDING</th>
                <th>CLAIMED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const tone: StatusTone =
                  entry.status === "UNLOCKED"
                    ? "live"
                    : entry.status === "LOCKED"
                      ? "warn"
                      : "neutral";
                return (
                  <tr key={entry.address}>
                    <td>
                      <div className="font-mono text-[10px] text-ink/85">
                        #{entry.nonce}
                      </div>
                      <div className="mt-0.5 font-mono text-[8px] text-dim">
                        {shortKey(entry.address, 5, 5)}
                      </div>
                    </td>
                    <td className="text-ink/85">
                      {formatAmount(entry.amount, TOKEN_DECIMALS)}
                      <span className="ml-1 text-dim">{TOKEN_SYMBOL}</span>
                    </td>
                    <td>
                      <div>{formatDate(entry.unlockAt)}</div>
                      <div className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-dim">
                        {entry.status === "UNLOCKED"
                          ? "UNLOCKED"
                          : entry.status === "COMPLETED"
                            ? "CLOSED"
                            : formatCountdown(entry.unlockAt)}
                      </div>
                    </td>
                    <td>
                      <StatusChip tone={tone}>{entry.status}</StatusChip>
                    </td>
                    <td className={entry.pendingRewards.gt(ZERO) ? "text-acid" : ""}>
                      {formatAmount(entry.pendingRewards, TOKEN_DECIMALS)}
                    </td>
                    <td>{formatAmount(entry.claimedRewards, TOKEN_DECIMALS)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          className="btn-outline px-2 py-1.5 text-[8px]"
                          onClick={() => onClaim(entry)}
                          disabled={
                            entry.pendingRewards.isZero() ||
                            preparingKey !== null ||
                            entry.status === "COMPLETED"
                          }
                        >
                          {preparingKey === `CLAIM:${entry.address}`
                            ? "SIM…"
                            : "CLAIM"}
                        </button>
                        <button
                          className="btn-outline px-2 py-1.5 text-[8px]"
                          onClick={() => onUnstake(entry, "claim")}
                          disabled={
                            entry.status !== "UNLOCKED" || preparingKey !== null
                          }
                          title={
                            entry.status === "LOCKED"
                              ? "The program rejects unstake before the lock expires"
                              : undefined
                          }
                        >
                          {preparingKey === `UNSTAKE:${entry.address}`
                            ? "SIM…"
                            : "UNSTAKE"}
                        </button>
                        {entry.status === "UNLOCKED" &&
                        entry.pendingRewards.gt(ZERO) ? (
                          <button
                            className="btn-danger px-2 py-1.5 text-[8px]"
                            onClick={() => onUnstake(entry, "emergency")}
                            disabled={preparingKey !== null}
                            title="Forfeits unclaimed rewards"
                          >
                            {preparingKey === `EMERGENCY_UNSTAKE:${entry.address}`
                              ? "SIM…"
                              : "EMERGENCY"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-white/[0.07] px-4 py-3 font-mono text-[8px] uppercase leading-relaxed tracking-[0.14em] text-dim sm:px-5">
        UNSTAKE IS REJECTED ON-CHAIN BEFORE THE LOCK EXPIRES. FIXED-POOL REWARDS ARE
        CLAIMED SEPARATELY UNLESS YOU USE UNSTAKE + CLAIM. EMERGENCY UNSTAKE FORFEITS
        UNCLAIMED REWARDS.
      </div>
    </Panel>
  );
}

function ActivityPanel({
  activity,
  connected,
  onRefresh,
}: {
  activity: ActivityRecord[];
  connected: boolean;
  onRefresh: () => void;
}) {
  return (
    <Panel quiet>
      <PanelHead
        label="LOCAL ACTIVITY LOG"
        right={
          <button
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim transition-colors hover:text-acid"
            onClick={onRefresh}
          >
            RELOAD
          </button>
        }
      />
      {!connected ? (
        <div className="p-5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          CONNECT A WALLET TO READ LOCAL TRANSACTION HISTORY
        </div>
      ) : activity.length === 0 ? (
        <div className="p-5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          NO LOCAL RECORDS // ON-CHAIN POSITIONS REMAIN AUTHORITATIVE
        </div>
      ) : (
        <div className="divide-y divide-white/[0.055]">
          {activity.map((record) => (
            <div
              key={record.signature}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-acid">
                  {record.type.replace("_", " ")}
                </span>
                <span className="font-mono text-[9px] text-muted">
                  {record.amountRaw
                    ? `${formatAmount(new BN(record.amountRaw), TOKEN_DECIMALS)} ${record.symbol}`
                    : record.symbol}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">
                  {formatDateTime(Math.floor(record.timestamp / 1000))} UTC
                </span>
                <a
                  className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink transition-colors hover:text-acid"
                  href={explorerTxUrl(record.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortKey(record.signature, 4, 4)} ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-white/[0.07] px-4 py-3 font-mono text-[8px] uppercase tracking-[0.14em] text-dim sm:px-5">
        THIS LOG IS STORED IN YOUR BROWSER ONLY. IT IS NOT A LEDGER AND MAY BE CLEARED.
      </div>
    </Panel>
  );
}

function EconomicsPanel({
  pool,
  audit,
  capRaw,
}: {
  pool: PoolSnapshot | null;
  audit: ReturnType<typeof auditEconomics>;
  capRaw: BN;
}) {
  const fullTermProjection = useMemo(() => {
    if (!pool?.rewardPool) return null;
    if (pool.rewardPool.account.rewardPeriod.isZero()) return null;
    return projectRewards({
      amount: capRaw,
      duration: pool.pool.maxDuration,
      minDuration: pool.pool.minDuration,
      maxDuration: pool.pool.maxDuration,
      maxWeight: pool.pool.maxWeight,
      rewardAmount: pool.rewardPool.account.rewardAmount,
      rewardPeriod: pool.rewardPool.account.rewardPeriod,
    });
  }, [capRaw, pool]);

  const reserveCoverage =
    fullTermProjection && fullTermProjection.total.gtn(0)
      ? pool!.rewardReserve.mul(new BN(10_000)).div(fullTermProjection.total).toNumber() /
        100
      : null;

  const mismatched =
    pool !== null && Math.abs(pool.impliedApr - TARGET_APY) > 0.05;
  const underfunded =
    fullTermProjection !== null &&
    pool !== null &&
    pool.rewardReserve.lt(fullTermProjection.total);

  const verdict = !pool
    ? "NO ON-CHAIN POOL TO VERIFY"
    : underfunded
      ? "REWARD RESERVE BELOW FULL-CAP LIABILITY"
      : mismatched
        ? "CONFIG TARGET ≠ ON-CHAIN IMPLIED APR"
        : "ON-CHAIN PARAMETERS MATCH THE CONFIGURED TARGET";

  return (
    <Panel>
      <PanelHead
        label="ECONOMICS AUDIT // READ ONLY"
        right={
          <StatusChip tone={underfunded ? "danger" : mismatched ? "warn" : "live"}>
            {underfunded ? "UNDERFUNDED" : mismatched ? "MISMATCH" : "CHECKED"}
          </StatusChip>
        }
      />
      <div className="space-y-2 px-4 py-4">
        <AuditRow label="CONFIG TARGET" value={`${formatPercent(TARGET_APY, 2)}`} />
        <AuditRow
          label="ON-CHAIN IMPLIED APR"
          value={pool ? `${formatPercent(pool.impliedApr, 2)}` : "—"}
          accent={pool ? !mismatched : false}
        />
        <AuditRow
          label="TERM"
          value={`${STAKE_DURATION_DAYS}D // ${(STAKE_DURATION_DAYS / 365).toFixed(3)} YEAR`}
        />
        <AuditRow
          label="FULL-CAP LIABILITY"
          value={
            fullTermProjection
              ? `${formatAmountFixed(fullTermProjection.total, TOKEN_DECIMALS, 6)} ${TOKEN_SYMBOL}`
              : "—"
          }
        />
        <AuditRow
          label="REWARD BUDGET"
          value={`${MAX_REWARD_ALLOCATION} ${TOKEN_SYMBOL}`}
        />
        <AuditRow
          label="RESERVE COVERAGE"
          value={reserveCoverage !== null ? formatPercent(reserveCoverage, 2) : "—"}
          accent={reserveCoverage !== null && reserveCoverage >= 100}
        />
        <AuditRow label="VERDICT" value={verdict} />
      </div>
      <ul className="space-y-2 border-t border-white/[0.07] px-4 py-4">
        {audit.findings.map((finding) => (
          <li
            key={finding}
            className="font-mono text-[9px] leading-relaxed text-amber/90"
          >
            <span className="text-amber">▸ </span>
            {finding}
          </li>
        ))}
        {underfunded ? (
          <li className="font-mono text-[9px] leading-relaxed text-danger">
            <span>▸ </span>
            The fixed reward vault holds less than the projected full-cap liability.
            Claims can fail once the reserve is drained.
          </li>
        ) : null}
        {mismatched && pool ? (
          <li className="font-mono text-[9px] leading-relaxed text-danger">
            <span>▸ </span>
            The live reward parameters imply {formatPercent(pool.impliedApr, 2)} simple
            annualized, not the {formatPercent(TARGET_APY, 2)} configuration target.
            Do not advertise the target as the protocol rate.
          </li>
        ) : null}
      </ul>
      <div className="border-t border-white/[0.07] px-4 py-3 font-mono text-[8px] uppercase leading-relaxed tracking-[0.14em] text-dim">
        STREAMFLOW HAS NO APY FIELD. RATES DERIVE FROM rewardAmount / rewardPeriod AND
        STAKE WEIGHT. PROJECTIONS ARE NOT GUARANTEES.
      </div>
    </Panel>
  );
}

function AuditRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-white/[0.07] pb-2 last:border-0 last:pb-0">
      <span className="hud-micro shrink-0">{label}</span>
      <span
        className={`min-w-0 break-words text-right font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] ${
          accent ? "text-acid" : "text-ink/80"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ProtocolPanel({ pool }: { pool: PoolSnapshot }) {
  return (
    <Panel quiet>
      <PanelHead label="PROTOCOL RECORD" title="STREAMFLOW // DEPLOYED PROGRAMS" />
      <div className="space-y-3 px-4 py-4">
        <ProgramRow
          label="STAKE POOL"
          address={pool.programs.stakePool}
        />
        <ProgramRow
          label="FIXED REWARDS"
          address={pool.programs.rewardPool}
        />
        <ProgramRow label="FEE MANAGER" address={pool.programs.feeManager} />
        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <AuditRow label="AUTO UNSTAKE" value={pool.pool.autoUnstake ? "ON" : "OFF"} />
          <AuditRow
            label="UNSTAKE PERIOD"
            value={
              pool.pool.unstakePeriod.gtn(0)
                ? formatDuration(pool.pool.unstakePeriod)
                : "NONE"
            }
          />
          <AuditRow
            label="PERMISSIONLESS"
            value={pool.pool.permissionless ? "YES" : "NO"}
          />
          <AuditRow
            label="FREEZE RECEIPT"
            value={pool.pool.freezeStakeMint ? "YES" : "NO"}
          />
          <AuditRow
            label="POOL AUTHORITY"
            value={shortKey(pool.pool.authority.toBase58(), 5, 5)}
          />
          <AuditRow
            label="REWARD POOL TYPE"
            value={REWARD_POOL_TYPE.toUpperCase()}
          />
        </div>
      </div>
      <div className="border-t border-white/[0.07] px-4 py-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-[9px] uppercase tracking-[0.14em]">
          <a
            className="text-muted transition-colors hover:text-acid"
            href={STREAMFLOW_DOCS.sdk}
            target="_blank"
            rel="noreferrer"
          >
            SDK DOCS ↗
          </a>
          <a
            className="text-muted transition-colors hover:text-acid"
            href={STREAMFLOW_DOCS.security}
            target="_blank"
            rel="noreferrer"
          >
            SECURITY ↗
          </a>
          <a
            className="text-muted transition-colors hover:text-acid"
            href={STREAMFLOW_DOCS.audits}
            target="_blank"
            rel="noreferrer"
          >
            AUDITS ↗
          </a>
        </div>
      </div>
    </Panel>
  );
}

function ProgramRow({ label, address }: { label: string; address: string }) {
  return (
    <div>
      <div className="hud-micro">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <a
          className="w-0 min-w-0 flex-1 truncate font-mono text-[9px] text-ink/75 transition-colors hover:text-acid"
          href={explorerAddressUrl(address)}
          target="_blank"
          rel="noreferrer"
          title={address}
        >
          {address}
        </a>
        <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.12em] text-dim">
          DEPLOYED
        </span>
      </div>
    </div>
  );
}

function RiskPanel() {
  const items = [
    [
      "LOCK ENFORCED",
      "The program rejects unstake before the selected duration. The UI cannot bypass it.",
    ],
    [
      "CLAIM IS MANUAL",
      "Fixed reward pools accrue into a reward entry. Use Claim or Unstake + Claim.",
    ],
    [
      "RESERVE DEPENDENT",
      "Rewards can only be paid from the funded fixed reward vault. An empty vault cannot pay.",
    ],
    [
      "AUTHORITY POWERS",
      "The pool authority can change authority, update future reward parameters, and claw back leftover rewards after expiry plus a delay. It cannot move staked principal.",
    ],
    [
      "NOT AN APY",
      "19% is a configuration target. The live implied rate is derived from on-chain parameters and can differ.",
    ],
    [
      "MAINNET GATE",
      "Mainnet writes are disabled unless explicitly enabled with VITE_MAINNET_WRITES=true after approval.",
    ],
  ];
  return (
    <Panel quiet>
      <PanelHead label="RISK SURFACE" title="READ BEFORE SIGNING" />
      <ul className="divide-y divide-white/[0.055]">
        {items.map(([title, body]) => (
          <li key={title} className="px-4 py-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-amber">
              {title}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ConfigGate({
  dataError,
  audit,
}: {
  dataError: string | null;
  audit: ReturnType<typeof auditEconomics>;
}) {
  return (
    <div className="mt-8 space-y-6">
      <div className="terminal p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber/20 pb-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber">
            STAKING CORE // NOT DEPLOYED
          </span>
          <StatusChip tone="warn">AWAITING POOL CONFIGURATION</StatusChip>
        </div>
        <h2 className="mt-6 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          THE TERMINAL IS HONEST.
          <br />
          <span className="text-amber">NO POOL, NO FAKE NUMBERS.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          The frontend and Streamflow integration are built, but no live stake pool or
          mint address has been supplied for this cluster. Staking, claiming, and
          unstaking stay disabled instead of pointing at an unverified contract.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="border border-white/10 bg-black/30 p-4">
            <div className="hud-label mb-3 text-amber">MISSING CONFIGURATION</div>
            <ul className="space-y-2 font-mono text-[10px] text-muted">
              {CONFIG_MISSING.map((item) => (
                <li key={item}>
                  <span className="text-danger">×</span> {item}
                </li>
              ))}
              {CONFIG_MISSING.length === 0 ? (
                <li className="text-amber">Pool lookup failed. Check the RPC and addresses.</li>
              ) : null}
            </ul>
          </div>
          <div className="border border-white/10 bg-black/30 p-4">
            <div className="hud-label mb-3 text-amber">REQUIRED ENVIRONMENT</div>
            <pre className="overflow-x-auto font-mono text-[9px] leading-relaxed text-muted">
{`VITE_SOLANA_CLUSTER=devnet
VITE_TOKEN_MINT=<verified mint>
VITE_STAKE_POOL=<verified pool>
VITE_REWARD_POOL=<fixed reward pool>
VITE_TOKEN_SYMBOL=${TOKEN_SYMBOL}
VITE_TOKEN_DECIMALS=${TOKEN_DECIMALS}
VITE_STAKE_DURATION_DAYS=${STAKE_DURATION_DAYS}
VITE_MAINNET_WRITES=false`}
            </pre>
          </div>
        </div>
        {dataError ? (
          <div className="mt-4">
            <Notice tone="danger" label="READ ERROR">
              {dataError}
            </Notice>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/" className="btn-outline px-5 py-3">
            RETURN TO ARCHIVE
          </Link>
          <a
            className="btn-outline px-5 py-3"
            href={STREAMFLOW_DOCS.developers}
            target="_blank"
            rel="noreferrer"
          >
            STREAMFLOW DOCS ↗
          </a>
        </div>
      </div>

      <EconomicsPanel pool={null} audit={audit} capRaw={capFromConfig()} />

      <Panel>
        <PanelHead label="WHY THIS GATE EXISTS" title="VERIFY BEFORE MAINNET" />
        <div className="grid gap-px bg-white/[0.07] md:grid-cols-3">
          {[
            [
              "01 // MINT",
              "Confirm the mint address, 8 decimals, supply, and mint/freeze authorities on-chain before publishing.",
            ],
            [
              "02 // POOL",
              "Confirm the stake pool and fixed reward pool belong to the same mint on the target cluster.",
            ],
            [
              "03 // ECONOMICS",
              "Fund the reward vault and verify the implied rate. The 19% target must be reconciled with the 10-token budget.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="bg-[#080b10] p-5">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-acid">
                {title}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
function ReviewModal({
  review,
  executing,
  error,
  onClose,
  onConfirm,
}: {
  review: ReviewState | null;
  executing: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [ack, setAck] = useState(false);
  const lock = writeLockReason();
  const simulationOk = Boolean(review && !review.preview.error);
  const emergency = review?.kind === "EMERGENCY_UNSTAKE";

  useEffect(() => {
    setAck(false);
  }, [review]);

  return (
    <Modal
      open={Boolean(review)}
      onClose={onClose}
      eyebrow="TRANSACTION REVIEW // SIMULATION"
      title={review?.title ?? ""}
      footer={
        review ? (
          <div className="space-y-3">
            {emergency ? (
              <label className="flex cursor-pointer items-start gap-3 border border-danger/25 bg-danger/[0.04] px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[#ff5d5d]"
                  checked={ack}
                  onChange={(event) => setAck(event.target.checked)}
                />
                <span className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-danger">
                  I understand this closes the entry and forfeits all unclaimed
                  rewards.
                </span>
              </label>
            ) : null}
            <button
              className="btn-primary w-full px-5 py-4"
              onClick={onConfirm}
              disabled={
                !simulationOk ||
                executing ||
                Boolean(lock) ||
                (emergency && !ack)
              }
            >
              {executing
                ? "AWAITING WALLET / CONFIRMING…"
                : simulationOk
                  ? "SIGN & SEND TRANSACTION"
                  : "SIMULATION FAILED — SIGNING BLOCKED"}
            </button>
            <button className="btn-ghost w-full" onClick={onClose} disabled={executing}>
              CANCEL
            </button>
          </div>
        ) : null
      }
    >
      {review ? (
        <div className="space-y-4">
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted">
            {review.detail}
          </p>

          <div className="space-y-2 border border-white/[0.08] bg-black/25 px-4 py-3">
            <ReviewRow label="ACTION" value={review.kind.replace("_", " ")} />
            <ReviewRow
              label="AMOUNT"
              value={`${formatAmount(review.amount, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`}
            />
            {review.entry ? (
              <>
                <ReviewRow label="ENTRY" value={`#${review.entry.nonce}`} />
                <ReviewRow label="UNLOCK" value={formatDate(review.entry.unlockAt)} />
              </>
            ) : null}
            <ReviewRow
              label="NETWORK FEE"
              value={formatLamports(review.preview.feeLamports)}
            />
            <ReviewRow
              label="ATA RENT"
              value={formatLamports(review.preview.ataRentLamports)}
            />
            <ReviewRow
              label="SIMULATION"
              value={review.preview.error ? "FAILED" : "PASSED"}
              tone={review.preview.error ? "danger" : "ok"}
            />
          </div>

          {review.preview.error ? (
            <Notice tone="danger" label="SIMULATION ERROR">
              <span className="whitespace-pre-wrap">{review.preview.error}</span>
            </Notice>
          ) : (
            <Notice tone="ok" label="SIMULATION PASSED">
              The transaction was simulated against the configured RPC. This does not
              guarantee landing if the chain state changes before signing.
            </Notice>
          )}

          {error ? (
            <Notice tone="danger" label="EXECUTION ERROR">
              <span className="whitespace-pre-wrap">{error}</span>
            </Notice>
          ) : null}

          {review.preview.logs.length ? (
            <details className="border border-white/[0.08] bg-black/30 px-3 py-2">
              <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
                SIMULATION LOGS ({review.preview.logs.length})
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[8px] leading-relaxed text-muted">
                {review.preview.logs.join("\n")}
              </pre>
            </details>
          ) : null}

          <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-dim">
            YOUR WALLET WILL ASK FOR APPROVAL. NO PRIVATE KEY OR SEED PHRASE IS EVER
            REQUESTED BY THIS SITE.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function ReviewRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="hud-micro shrink-0">{label}</span>
      <span
        className={`text-right font-mono text-[10px] uppercase tracking-[0.1em] ${
          tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink/85"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SuccessModal({
  success,
  onClose,
}: {
  success: SuccessState | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(success)}
      onClose={onClose}
      eyebrow="TRANSACTION CONFIRMED"
      title="ON-CHAIN RECORD UPDATED"
      footer={
        success ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <a
              className="btn-primary px-5 py-3.5"
              href={explorerTxUrl(success.signature)}
              target="_blank"
              rel="noreferrer"
            >
              VIEW ON EXPLORER ↗
            </a>
            <button className="btn-outline px-5 py-3.5" onClick={onClose}>
              CLOSE
            </button>
          </div>
        ) : null
      }
    >
      {success ? (
        <div className="space-y-4">
          <Notice tone="ok" label="CONFIRMED">
            {success.kind.replace("_", " ")} transaction confirmed on {CLUSTER_LABEL}.
            Position data refreshes automatically.
          </Notice>
          <div className="border border-white/[0.08] bg-black/25 px-4 py-3">
            <div className="hud-micro mb-2">SIGNATURE</div>
            <div className="break-all font-mono text-[11px] text-ink">
              {success.signature}
            </div>
            <div className="mt-3">
              <CopyValue value={success.signature} />
            </div>
          </div>
          {IS_MAINNET ? (
            <Notice tone="warn" label="MAINNET">
              This was a Mainnet transaction. Verify the position on-chain before
              relying on the local activity log.
            </Notice>
          ) : (
            <Notice tone="info" label="DEVNET">
              This is a Devnet record. It has no real value and is used only to verify
              the integration.
            </Notice>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
