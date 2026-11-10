import BN from "bn.js";
import { calculateStakeWeight } from "@streamflow/staking";
import { SECONDS_PER_YEAR, ZERO } from "./format";

export const SCALE = new BN(1_000_000_000);

export interface RewardProjection {
  amount: BN;
  duration: BN;
  weight: BN;
  effectiveAmount: BN;
  periods: BN;
  rewardPerPeriod: BN;
  total: BN;
}

export interface RewardProjectionInput {
  amount: BN;
  duration: BN;
  minDuration: BN;
  maxDuration: BN;
  maxWeight: BN;
  rewardAmount: BN;
  rewardPeriod: BN;
}

/**
 * Mirrors the public reward accumulator logic in @streamflow/staking:
 *   effective = amount * weight / 1e9
 *   perPeriod = effective * rewardAmount / 1e9
 *   total     = perPeriod * floor(duration / rewardPeriod)
 *
 * This is an estimate for UI disclosure only. The authoritative claimable
 * amount is always the on-chain RewardEntry read through calcRewards().
 */
export function projectRewards(input: RewardProjectionInput): RewardProjection {
  const weight = calculateStakeWeight(
    input.minDuration,
    input.maxDuration,
    input.maxWeight,
    input.duration,
  );
  const effectiveAmount = input.amount.mul(weight).div(SCALE);
  const periods = input.rewardPeriod.isZero()
    ? ZERO
    : input.duration.div(input.rewardPeriod);
  const rewardPerPeriod = effectiveAmount.mul(input.rewardAmount).div(SCALE);
  const total = rewardPerPeriod.mul(periods);

  return {
    amount: input.amount,
    duration: input.duration,
    weight,
    effectiveAmount,
    periods,
    rewardPerPeriod,
    total,
  };
}

/**
 * Simple annualized rate implied by a Streamflow rewardAmount/rewardPeriod
 * pair, assuming a 1.0x stake weight. Displayed as "effective APR", not a
 * promise. Streamflow has no APY field on-chain.
 */
export function impliedApr(rewardAmount: BN, rewardPeriod: BN): number {
  if (rewardPeriod.isZero()) return 0;
  const perYear = rewardAmount.mul(new BN(SECONDS_PER_YEAR)).div(rewardPeriod);
  return (perYear.toNumber() / 1_000_000_000) * 100;
}

/**
 * Converts a desired simple annual percentage rate into a Streamflow
 * rewardAmount for a given reward period, using integer arithmetic.
 * `apyPercent` is expressed in hundredths of a percent (1900 = 19.00%).
 */
export function rewardAmountForApy(
  apyPercent: number,
  rewardPeriodSeconds: number,
): BN {
  if (!Number.isFinite(apyPercent) || apyPercent <= 0) return ZERO;
  if (rewardPeriodSeconds <= 0) return ZERO;

  const apyBps = BigInt(Math.round(apyPercent * 100));
  const period = BigInt(Math.round(rewardPeriodSeconds));
  const numerator = apyBps * period * 1_000_000_000n;
  const denominator = 10_000n * BigInt(SECONDS_PER_YEAR);
  return new BN((numerator / denominator).toString());
}

/**
 * APY actually delivered by a projection over its own lock duration.
 * Uses the projection total (which includes weight), not the target.
 */
export function deliveredApr(projection: RewardProjection): number {
  if (projection.amount.isZero() || projection.duration.isZero()) return 0;
  const ratio =
    projection.total.mul(new BN(1_000_000)).div(projection.amount).toNumber() /
    1_000_000;
  return ratio * (SECONDS_PER_YEAR / projection.duration.toNumber()) * 100;
}

export interface EconomicsAudit {
  targetApy: number;
  cap: number;
  rewardAllocation: number;
  termDays: number;
  capacityAtTarget: number;
  capacityOverTerm: number;
  fullYearLiability: number;
  maxSustainableFullYearApy: number;
  findings: string[];
}

/**
 * Compares the requested 19% / 90 cap / 10 budget / 182 day targets.
 * All figures are display-only calculations; no transaction is implied.
 */
export function auditEconomics(
  targetApy: number,
  cap: number,
  rewardAllocation: number,
  termDays: number,
): EconomicsAudit {
  const termYears = termDays / 365;
  const capacityAtTarget = cap * (targetApy / 100) * termYears;
  const capacityOverTerm = cap * (targetApy / 100) * (1 - termYears);
  const fullYearLiability = cap * (targetApy / 100);
  const maxSustainableFullYearApy = cap > 0 ? (rewardAllocation / cap) * 100 : 0;

  const findings: string[] = [];
  if (capacityAtTarget > rewardAllocation) {
    findings.push(
      `A ${targetApy}% term over ${termDays} days on the full ${cap} cap needs ${capacityAtTarget.toFixed(
        2,
      )} tokens of rewards, above the ${rewardAllocation} token budget.`,
    );
  }
  if (fullYearLiability > rewardAllocation) {
    findings.push(
      `If principals stay staked for a full year, ${targetApy}% on ${cap} creates ${fullYearLiability.toFixed(
        2,
      )} tokens of liability. The ${rewardAllocation} token budget only supports about ${maxSustainableFullYearApy.toFixed(
        2,
      )}% simple annualized on the full cap.`,
    );
  }
  if (termYears < 1) {
    findings.push(
      `A ${termDays}-day term is ${termYears.toFixed(
        3,
      )} of a 365-day year; rewards must not be advertised as a full-year APY.`,
    );
  }
  if (!findings.length) {
    findings.push("Targets are fully funded for the configured term and cap.");
  }

  return {
    targetApy,
    cap,
    rewardAllocation,
    termDays,
    capacityAtTarget,
    capacityOverTerm,
    fullYearLiability,
    maxSustainableFullYearApy,
    findings,
  };
}
