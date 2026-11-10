import { useWallet } from "@solana/wallet-adapter-react";
import { shortKey } from "../../lib/format";
import { useWalletUI } from "./WalletUI";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { connected, connecting, publicKey } = useWallet();
  const { openModal } = useWalletUI();

  if (connecting) {
    return (
      <button className="btn-outline px-3 py-2 text-[10px]" onClick={openModal}>
        LINKING…
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <button
        className="btn-outline group gap-2 px-3 py-2 text-[10px] text-ink"
        onClick={openModal}
        title="Wallet details"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        {compact ? shortKey(publicKey.toBase58(), 3, 3) : shortKey(publicKey.toBase58())}
        <span className="text-dim transition-colors group-hover:text-acid">▾</span>
      </button>
    );
  }

  return (
    <button className="btn-primary px-4 py-2.5 text-[10px]" onClick={openModal}>
      CONNECT WALLET
    </button>
  );
}
