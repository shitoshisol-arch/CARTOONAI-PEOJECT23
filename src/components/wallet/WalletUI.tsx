import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  WalletReadyState,
  type WalletName,
} from "@solana/wallet-adapter-base";
import {
  CLUSTER_LABEL,
  RPC_ENDPOINT,
  explorerAddressUrl,
} from "../../lib/config";
import { copyText, shortKey } from "../../lib/format";

interface WalletUIData {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const WalletUIContext = createContext<WalletUIData | null>(null);

export function useWalletUI(): WalletUIData {
  const context = useContext(WalletUIContext);
  if (!context) throw new Error("useWalletUI must be used within WalletUIProvider");
  return context;
}

export function WalletUIProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, openModal, closeModal }),
    [open, openModal, closeModal],
  );

  return (
    <WalletUIContext.Provider value={value}>
      {children}
      <WalletModal />
    </WalletUIContext.Provider>
  );
}

function WalletModal() {
  const { open, closeModal } = useWalletUI();
  const {
    wallets,
    select,
    connect,
    disconnect,
    connected,
    connecting,
    wallet,
    publicKey,
    disconnecting,
  } = useWallet();
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const attempted = useRef(false);

  const sortedWallets = useMemo(() => {
    const rank = (state: WalletReadyState) => {
      if (state === WalletReadyState.Installed) return 0;
      if (state === WalletReadyState.Loadable) return 1;
      return 2;
    };
    return [...wallets].sort(
      (a, b) => rank(a.adapter.readyState) - rank(b.adapter.readyState),
    );
  }, [wallets]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPendingName(null);
    attempted.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, closeModal]);

  useEffect(() => {
    if (!open) return;
    if (connected) {
      setPendingName(null);
      closeModal();
    }
  }, [connected, open, closeModal]);

  useEffect(() => {
    if (!open || !pendingName || attempted.current) return;
    if (!wallet || wallet.adapter.name !== pendingName) return;
    if (connected || connecting) return;
    attempted.current = true;
    connect().catch((connectError: unknown) => {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "WALLET CONNECTION WAS REJECTED",
      );
      setPendingName(null);
    });
  }, [open, pendingName, wallet, connected, connecting, connect]);

  if (!open) return null;

  const handleSelect = (name: string) => {
    setError(null);
    attempted.current = false;
    setPendingName(name);
    select(name as WalletName);
  };

  const handleCopy = async () => {
    if (!publicKey) return;
    try {
      await copyText(publicKey.toBase58());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("CLIPBOARD UNAVAILABLE");
    }
  };

  return (
    <div
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Wallet connection"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div className="modal-card">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="hud-label text-acid">SECURE WALLET LINK</p>
            <h2 className="mt-2 font-display text-2xl font-medium tracking-tight">
              {connected ? "LINK ESTABLISHED" : "SELECT A SIGNER"}
            </h2>
          </div>
          <button className="btn-ghost" onClick={closeModal} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mb-5 border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted">
          <span className="text-acid">NOTICE //</span> CHILL106 never asks for a seed
          phrase or private key. Every transaction must be approved inside your wallet.
        </div>

        {connected && publicKey ? (
          <div className="space-y-4">
            <div className="border border-acid/20 bg-acid/[0.03] p-4">
              <div className="hud-label mb-2 text-acid">CONNECTED SIGNER</div>
              <div className="break-all font-mono text-sm text-ink">
                {publicKey.toBase58()}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="chip border-ok/30 text-ok">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" /> {CLUSTER_LABEL}
                </span>
                <span className="chip">{wallet?.adapter.name ?? "WALLET"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="btn-outline" onClick={handleCopy}>
                {copied ? "COPIED" : "COPY ADDRESS"}
              </button>
              <a
                className="btn-outline"
                href={explorerAddressUrl(publicKey.toBase58())}
                target="_blank"
                rel="noreferrer"
              >
                VIEW ON EXPLORER ↗
              </a>
            </div>

            <button
              className="btn-danger w-full"
              onClick={() => {
                void disconnect();
                closeModal();
              }}
              disabled={disconnecting}
            >
              {disconnecting ? "DISCONNECTING…" : "DISCONNECT"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedWallets.length === 0 ? (
              <div className="border border-white/10 p-5 text-center font-mono text-[11px] text-muted">
                NO SOLANA WALLETS DETECTED. INSTALL PHANTOM OR SOLFLARE, THEN RELOAD.
              </div>
            ) : (
              sortedWallets.map((candidate) => {
                const adapter = candidate.adapter;
                const installed = adapter.readyState === WalletReadyState.Installed;
                const loadable = adapter.readyState === WalletReadyState.Loadable;
                const available = installed || loadable;
                const isPending = pendingName === adapter.name && connecting;

                return (
                  <div
                    key={adapter.name}
                    className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {adapter.icon ? (
                        <img
                          src={adapter.icon}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded-sm"
                        />
                      ) : (
                        <div className="h-7 w-7 shrink-0 border border-white/20" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs uppercase tracking-wider text-ink">
                          {adapter.name}
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
                          {isPending
                            ? "AWAITING APPROVAL…"
                            : installed
                              ? "DETECTED"
                              : loadable
                                ? "AVAILABLE"
                                : "NOT DETECTED"}
                        </div>
                      </div>
                    </div>

                    {available ? (
                      <button
                        className="btn-outline shrink-0 px-3 py-2 text-[10px]"
                        onClick={() => handleSelect(adapter.name)}
                        disabled={Boolean(pendingName) && connecting}
                      >
                        {isPending ? "LINKING…" : "CONNECT"}
                      </button>
                    ) : (
                      <a
                        className="btn-outline shrink-0 px-3 py-2 text-[10px]"
                        href={adapter.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        INSTALL ↗
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {error ? (
          <div className="mt-4 border border-danger/30 bg-danger/[0.05] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-danger">
            {error}
          </div>
        ) : null}

        <div className="mt-5 border-t border-white/10 pt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
          RPC // {RPC_ENDPOINT.replace(/^https?:\/\//, "").slice(0, 52)}
        </div>
      </div>
    </div>
  );
}
