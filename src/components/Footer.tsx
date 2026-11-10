import { Link } from "react-router-dom";
import { STREAMFLOW_DOCS, STREAMFLOW_PROGRAM_IDS } from "../lib/config";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/[0.07]">
      <div className="shell py-12">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr]">
          <div>
            <div className="font-display text-2xl font-semibold tracking-[0.08em]">
              CHILL<span className="text-acid">106</span>
            </div>
            <p className="mt-4 max-w-xs font-mono text-[10px] leading-relaxed text-muted">
              FILE106 is an independent archive experiment on Solana. Nothing on this
              site is financial advice. On-chain data is the only source of truth for
              balances, rewards, and lock state.
            </p>
            <div className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-acid" />
              SIGNAL STABLE // 2026
            </div>
          </div>

          <FooterColumn
            title="ARCHIVE"
            links={[
              { label: "THE FILE", href: "/#file" },
              { label: "RECOVERED FRAGMENTS", href: "/#archive" },
              { label: "TOKEN RECORD", href: "/#token" },
            ]}
          />

          <FooterColumn
            title="PROTOCOL"
            links={[
              { label: "STAKING ↗", href: "/staking" },
              { label: "READ-ONLY ADMIN", href: "/staking/admin" },
              { label: "STREAMFLOW SDK ↗", href: STREAMFLOW_DOCS.sdk, external: true },
            ]}
          />

          <div>
            <div className="hud-label mb-4">CONTRACT LAYER</div>
            <div className="space-y-3 font-mono text-[9px] text-muted">
              <div>
                <div className="text-dim">STAKE POOL PROGRAM</div>
                <div className="mt-1 break-all text-ink/80">
                  {STREAMFLOW_PROGRAM_IDS.stakePool}
                </div>
              </div>
              <div>
                <div className="text-dim">FIXED REWARD PROGRAM</div>
                <div className="mt-1 break-all text-ink/80">
                  {STREAMFLOW_PROGRAM_IDS.rewardPoolFixed}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/[0.07] pt-5 font-mono text-[9px] uppercase tracking-[0.16em] text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 CHILL106 // FILE ARCHIVE</span>
          <span>
            STAKING INFRASTRUCTURE BY{" "}
            <a
              href={STREAMFLOW_DOCS.developers}
              target="_blank"
              rel="noreferrer"
              className="text-ink transition-colors hover:text-acid"
            >
              STREAMFLOW ↗
            </a>
          </span>
          <span>NO SEED PHRASES. NO CUSTODY. NO GUARANTEES.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}) {
  return (
    <div>
      <div className="hud-label mb-4">{title}</div>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.href + link.label}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-acid"
              >
                {link.label}
              </a>
            ) : (
              <Link
                to={link.href}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-acid"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
