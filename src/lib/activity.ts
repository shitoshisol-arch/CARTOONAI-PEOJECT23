export type ActivityType =
  | "STAKE"
  | "CLAIM"
  | "UNSTAKE"
  | "EMERGENCY_UNSTAKE";

export interface ActivityRecord {
  signature: string;
  type: ActivityType;
  wallet: string;
  amountRaw?: string;
  symbol: string;
  timestamp: number;
  status: "CONFIRMED";
}

const PREFIX = "chill106.activity.v1.";

function storageKey(wallet: string): string {
  return `${PREFIX}${wallet}`;
}

export function loadActivity(wallet: string | null): ActivityRecord[] {
  if (!wallet) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(wallet));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.signature === "string");
  } catch {
    return [];
  }
}

export function appendActivity(
  wallet: string,
  record: Omit<ActivityRecord, "wallet">,
): ActivityRecord[] {
  const current = loadActivity(wallet);
  const next = [{ ...record, wallet }, ...current]
    .filter(
      (item, index, arr) =>
        arr.findIndex((candidate) => candidate.signature === item.signature) === index,
    )
    .slice(0, 60);
  try {
    window.localStorage.setItem(storageKey(wallet), JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); the on-chain position remains authoritative.
  }
  return next;
}
