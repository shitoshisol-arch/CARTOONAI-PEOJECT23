import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { WalletButton } from "./wallet/WalletButton";
import { CLUSTER_LABEL, IS_MAINNET } from "../lib/config";

const DESKTOP_LINKS = [
  { label: "THE FILE", to: "/#file" },
  { label: "ARCHIVE", to: "/#archive" },
  { label: "TOKEN", to: "/#token" },
];

const MOBILE_LINKS = [
  { index: "01", label: "THE FILE", to: "/#file" },
  { index: "02", label: "ARCHIVE", to: "/#archive" },
  { index: "03", label: "TOKEN", to: "/#token" },
  { index: "04", label: "STAKING PROTOCOL", to: "/staking" },
];

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-void/80 backdrop-blur-xl">
        <div className="shell flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
            {DESKTOP_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <NavLink
              to="/staking"
              className={({ isActive }) =>
                `group font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                  isActive ? "text-acid" : "text-ink hover:text-acid"
                }`
              }
            >
              STAKING <span className="text-acid">↗</span>
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <span className="chip border-white/10">
                <span className={`h-1.5 w-1.5 rounded-full ${IS_MAINNET ? "bg-ember" : "bg-ice"}`} />
                {CLUSTER_LABEL}
              </span>
              <WalletButton />
            </div>

            <button
              className="flex h-9 w-9 items-center justify-center border border-white/15 bg-white/[0.02] text-ink lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation"
            >
              <span className="relative block h-3 w-4">
                <span
                  className={`absolute left-0 top-0 h-px w-full bg-current transition-transform ${
                    mobileOpen ? "translate-y-1.5 rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-1.5 h-px w-full bg-current transition-opacity ${
                    mobileOpen ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-3 h-px w-full bg-current transition-transform ${
                    mobileOpen ? "-translate-y-1.5 -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-void/97 pt-16 lg:hidden">
          <div className="bg-grid absolute inset-0 opacity-30" />
          <div className="relative flex flex-1 flex-col justify-between px-5 pb-8 pt-8">
            <nav className="space-y-1" aria-label="Mobile">
              {MOBILE_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="group flex items-baseline gap-4 border-b border-white/[0.07] py-4"
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="font-mono text-[9px] text-dim">{link.index}</span>
                  <span className="font-display text-3xl font-medium tracking-tight text-ink transition-colors group-hover:text-acid">
                    {link.label}
                  </span>
                  <span className="ml-auto font-mono text-acid opacity-0 transition-opacity group-hover:opacity-100">
                    ↗
                  </span>
                </Link>
              ))}
            </nav>

            <div className="space-y-4">
              <div className="flex items-center justify-between border border-white/10 px-4 py-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
                  NETWORK
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
                  {CLUSTER_LABEL}
                </span>
              </div>
              <div className="[&>button]:w-full">
                <WalletButton />
              </div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
                FILE106 // ACCESS GRANTED // 2026
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
