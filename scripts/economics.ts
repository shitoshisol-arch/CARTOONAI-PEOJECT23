/**
 * Economics audit CLI.
 *
 * Prints the on-chain rewardAmount required for a target rate, the reward a
 * position actually earns over the configured term, and every contradiction
 * between the product brief and what the Streamflow program can pay.
 *
 * Usage:
 *   npx tsx scripts/economics.ts
 *   npx tsx scripts/economics.ts 19 90 10 182
 */
import BN from "bn.js";
import {
  auditEconomics,
  deliveredApr,
  impliedApr,
  projectRewards,
  rewardAmountForApy,
  SCALE,
} from "../src/lib/economics";
import { SECONDS_PER_YEAR } from "../src/lib/format";

const DAY = 86_400;
const DECIMALS = 8;
const ONE = new BN(10 ** DECIMALS);

const [apyArg, capArg, allocArg, daysArg] = process.argv.slice(2);
const targetApy = Number(apyArg ?? 19);
const cap = Number(capArg ?? 90);
const rewardAllocation = Number(allocArg ?? 10);
const termDays = Number(daysArg ?? 182);
const duration = new BN(termDays * DAY);

function fmt(raw: BN): string {
  const whole = raw.div(ONE).toString();
  const frac = raw.mod(ONE).toString().padStart(DECIMALS, "0").slice(0, 6);
  return `${whole}.${frac}`;
}

function main() {
  const dailyRewardAmount = rewardAmountForApy(targetApy, DAY);
  const dailyApr = impliedApr(dailyRewardAmount, new BN(DAY));

  const projection = projectRewards({
    amount: ONE.muln(cap),
    duration,
    minDuration: duration,
    maxDuration: duration,
    maxWeight: new BN(1_000_000_000),
    rewardAmount: dailyRewardAmount,
    rewardPeriod: new BN(DAY),
  });

  const audit = auditEconomics(targetApy, cap, rewardAllocation, termDays);
  const effectiveDeliveredApr = deliveredApr(projection);
  const annualisedOnCap = cap * (targetApy / 100);
  const fullTermOnCap = annualisedOnCap * (termDays / 365);
  const budgetDrivenFullYearApy = cap > 0 ? (rewardAllocation / cap) * 100 : 0;

  console.log("CHILL106 / FILE106 economics audit");
  console.log("==================================");
  console.log(`Target rate:              ${targetApy}% / year (simple)`);
  console.log(`Stake cap:                ${cap} tokens`);
  console.log(`Reward allocation:        ${rewardAllocation} tokens`);
  console.log(`Lock term:                ${termDays} days`);
  console.log("");
  console.log("Streamflow parameters");
  console.log(`  rewardPeriod:           ${DAY} s (daily)`);
  console.log(`  rewardAmount:           ${dailyRewardAmount.toString()} base units`);
  console.log(`                          = ${fmt(dailyRewardAmount)} tokens per effective token per day`);
  console.log(`  implied APR (1.0x):     ${dailyApr.toFixed(4)}%`);
  console.log(`  DECIMALS / SCALE:       ${DECIMALS} / ${SCALE.toString()}`);
  console.log("");
  console.log("Position projection at full cap, 1.0x weight");
  console.log(`  weight:                 ${projection.weight.toString()} / 1e9`);
  console.log(`  periods paid:           ${projection.periods.toString()}`);
  console.log(`  reward per period:      ${fmt(projection.rewardPerPeriod)} tokens`);
  console.log(`  total over term:        ${fmt(projection.total)} tokens`);
  console.log(`  delivered APR:          ${effectiveDeliveredApr.toFixed(4)}%`);
  console.log("");
  console.log("Budget reality");
  console.log(`  ${targetApy}% for a FULL year on ${cap}:  ${annualisedOnCap.toFixed(4)} tokens`);
  console.log(`  ${targetApy}% for ${termDays} days on ${cap}: ${fullTermOnCap.toFixed(4)} tokens`);
  console.log(`  budget supports on ${cap}:            ${budgetDrivenFullYearApy.toFixed(4)}% full-year simple rate`);
  console.log(`  seconds per year:                     ${SECONDS_PER_YEAR}`);
  console.log("");
  console.log("Findings");
  for (const finding of audit.findings) {
    console.log(`  - ${finding}`);
  }
  console.log("");
  console.log("Decision rule: never advertise a rate the funded budget cannot pay.");
  console.log("If the brief says 19% but the budget says ~11.11% full-year, report it");
  console.log("and either extend the reward budget or advertise the funded rate.");
}

main();
