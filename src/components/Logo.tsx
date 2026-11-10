import { Link } from "react-router-dom";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-3" aria-label="CHILL106 home">
      <span className="relative flex h-9 w-9 items-center justify-center border border-acid/50 bg-acid/[0.04] font-mono text-[10px] font-bold text-acid transition-colors group-hover:border-acid">
        106
        <span className="absolute -right-px -top-px h-1.5 w-1.5 bg-acid" />
        <span className="absolute -bottom-px -left-px h-1.5 w-1.5 bg-acid" />
      </span>
      <span className="leading-none">
        <span className={`block font-display font-semibold tracking-[0.08em] ${small ? "text-sm" : "text-base"}`}>
          CHILL<span className="text-acid">106</span>
        </span>
        <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.26em] text-dim">
          FILE ARCHIVE // SOLANA
        </span>
      </span>
    </Link>
  );
}
