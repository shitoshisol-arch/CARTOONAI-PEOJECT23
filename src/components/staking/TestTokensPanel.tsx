import { useState } from "react";
import { TEST_FAUCET_ENABLED, TOKEN_SYMBOL, explorerTxUrl } from "../../lib/config";
import { Panel, PanelHead, StatusChip } from "../ui";

type ClaimState =
  | { kind: "idle" }
  | { kind: "claiming" }
  | { kind: "claimed"; signature: string; amount: string; solDrip?: number }
  | { kind: "already" }
  | { kind: "error"; message: string };

export function TestTokensPanel({
  connected,
  walletAddress,
  onClaimed,
}: {
  connected: boolean;
  walletAddress: string | null;
  onClaimed: () => void;
}) {
  const [state, setState] = useState<ClaimState>({ kind: "idle" });

  if (!TEST_FAUCET_ENABLED) return null;

  async function claim() {
    if (!walletAddress) return;
    setState({ kind: "claiming" });
    try {
      const response = await fetch("/api/test-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress }),
      });
      const payload = (await response.json()) as {
        alreadyClaimed?: boolean;
        signature?: string;
        amount?: string;
        solDrip?: number;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Faucet returned ${response.status}`);
      }
      if (payload.alreadyClaimed) {
        setState({ kind: "already" });
        onClaimed();
        return;
      }
      setState({
        kind: "claimed",
        signature: payload.signature ?? "",
        amount: payload.amount ?? "100",
        solDrip: payload.solDrip,
      });
      onClaimed();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Faucet request failed",
      });
    }
  }

  return (
    <Panel quiet>
      <PanelHead
        label="DEVNET TEST FAUCET"
        title={`GET 100 TEST ${TOKEN_SYMBOL}`}
        right={<StatusChip tone="warn">TEST ONLY</StatusChip>}
      />
      <div className="space-y-3 p-4">
        <p className="text-[10px] leading-relaxed text-muted">
          This is a disposable Devnet pool, not F106 Mainnet. Claim test tokens and a
          little Devnet SOL for fees, then stake below. Set Phantom to{" "}
          <span className="text-ink/85">Devnet</span> before signing.
        </p>

        {!connected ? (
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">
            Connect a wallet to claim test tokens.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-primary px-4 py-2.5"
              onClick={() => void claim()}
              disabled={state.kind === "claiming"}
            >
              {state.kind === "claiming" ? "SENDING…" : "CLAIM 100 TEST TOKENS"}
            </button>
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">
              ONE CLAIM PER WALLET BALANCE
            </span>
          </div>
        )}

        {state.kind === "claimed" ? (
          <p className="font-mono text-[9px] leading-relaxed text-acid">
            +{state.amount} {TOKEN_SYMBOL} received
            {state.solDrip ? ` + ${state.solDrip} SOL for fees` : ""}.{" "}
            {state.signature ? (
              <a
                className="underline decoration-acid/40 underline-offset-2 hover:text-ink"
                href={explorerTxUrl(state.signature)}
                target="_blank"
                rel="noreferrer"
              >
                VIEW TX ↗
              </a>
            ) : null}
          </p>
        ) : null}
        {state.kind === "already" ? (
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-amber">
            Wallet already holds test tokens.
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p className="font-mono text-[9px] leading-relaxed text-danger">
            {state.message}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
