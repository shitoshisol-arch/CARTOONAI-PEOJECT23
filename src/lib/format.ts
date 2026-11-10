import BN from "bn.js";

export const ZERO = new BN(0);
export const ONE = new BN(1);
export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_YEAR = 31_536_000;

export function pow10(decimals: number): BN {
  return new BN(10).pow(new BN(decimals));
}

export function toBigInt(value: BN): bigint {
  return BigInt(value.toString(10));
}

export function fromBigInt(value: bigint): BN {
  return new BN(value.toString());
}

export interface ParseResult {
  ok: boolean;
  value?: BN;
  error?: string;
}

/** Strict display-unit parser. Never uses floating point. */
export function parseAmount(input: string, decimals: number): ParseResult {
  const value = input.trim();
  if (!value) return { ok: false, error: "ENTER AN AMOUNT" };
  if (!/^\d*(\.\d*)?$/.test(value)) return { ok: false, error: "NUMBERS AND ONE DECIMAL POINT ONLY" };
  if (value === ".") return { ok: false, error: "INVALID AMOUNT" };

  const [wholePart, fracPartRaw = ""] = value.split(".");
  if (fracPartRaw.length > decimals) {
    return { ok: false, error: `MAX ${decimals} DECIMALS` };
  }

  const fracPart = fracPartRaw.padEnd(decimals, "0");
  const base = pow10(decimals);
  const whole = new BN(wholePart || "0");
  const frac = fracPart ? new BN(fracPart) : ZERO;
  const raw = whole.mul(base).add(frac);

  if (raw.lte(ZERO)) return { ok: false, error: "AMOUNT MUST BE GREATER THAN ZERO" };
  return { ok: true, value: raw };
}

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Formats base units for display. Truncates (never rounds up) to maxFraction
 * digits so the UI cannot overstate a balance or reward.
 */
export function formatAmount(
  raw: BN | null | undefined,
  decimals: number,
  maxFraction = 4,
): string {
  if (!raw) return "—";
  const negative = raw.isNeg();
  const abs = negative ? raw.neg() : raw;
  const base = pow10(decimals);
  const whole = abs.div(base);
  const remainder = abs.mod(base);
  let fraction = remainder.toString(10).padStart(decimals, "0");

  if (maxFraction <= 0) {
    fraction = "";
  } else {
    fraction = fraction.slice(0, maxFraction).replace(/0+$/, "");
  }

  const wholeFormatted = groupThousands(whole.toString(10));
  return `${negative ? "-" : ""}${wholeFormatted}${fraction ? `.${fraction}` : ""}`;
}

export function formatAmountFixed(
  raw: BN | null | undefined,
  decimals: number,
  fractionDigits: number,
): string {
  if (!raw) return "—";
  const base = pow10(decimals);
  const whole = raw.div(base);
  const remainder = raw.mod(base);
  const fraction = remainder
    .toString(10)
    .padStart(decimals, "0")
    .slice(0, fractionDigits)
    .padEnd(fractionDigits, "0");
  return `${groupThousands(whole.toString(10))}${fractionDigits > 0 ? `.${fraction}` : ""}`;
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}

export function formatLamports(lamports: number | null | undefined): string {
  if (lamports === null || lamports === undefined) return "—";
  return `${(lamports / 1_000_000_000).toFixed(6)} SOL`;
}

export function shortKey(value: string | null | undefined, front = 4, back = 4): string {
  if (!value) return "—";
  if (value.length <= front + back + 3) return value;
  return `${value.slice(0, front)}…${value.slice(-back)}`;
}

export function dateFromUnix(seconds: number | BN | null | undefined): Date | null {
  if (seconds === null || seconds === undefined) return null;
  const n = BN.isBN(seconds) ? seconds.toNumber() : seconds;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

export function formatDate(seconds: number | BN | null | undefined): string {
  const date = dateFromUnix(seconds);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(seconds: number | BN | null | undefined): string {
  const date = dateFromUnix(seconds);
  if (!date) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function formatDuration(seconds: number | BN): string {
  const total = BN.isBN(seconds) ? seconds.toNumber() : seconds;
  if (!Number.isFinite(total) || total <= 0) return "—";
  const days = Math.floor(total / SECONDS_PER_DAY);
  const hours = Math.floor((total % SECONDS_PER_DAY) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);

  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  if (minutes > 0) return `${minutes}M ${secs}S`;
  return `${secs}S`;
}

export function formatCountdown(unlockAt: number): string {
  const delta = unlockAt - nowSeconds();
  if (delta <= 0) return "UNLOCKED";
  return formatDuration(delta);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentOf(part: BN, total: BN): number {
  if (total.isZero()) return 0;
  return clamp(part.mul(new BN(10_000)).div(total).toNumber() / 100, 0, 100);
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error("Clipboard unavailable"));
}
