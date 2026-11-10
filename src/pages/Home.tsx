import { Link } from "react-router-dom";
import {
  APP,
  CLUSTER_LABEL,
  CONFIG_READY,
  MAX_REWARD_ALLOCATION,
  MAX_STAKE_CAP,
  STAKE_DURATION_DAYS,
  TARGET_APY,
  TOKEN_MINT,
  TOKEN_SYMBOL,
} from "../lib/config";
import { shortKey } from "../lib/format";
import { Panel, PanelHead, Redacted, StatusChip } from "../components/ui";

const TICKER_ITEMS = [
  `${TOKEN_SYMBOL} // SOLANA`,
  "FILE 106 // OPEN INVESTIGATION",
  `STAKING TERM // ${STAKE_DURATION_DAYS} DAYS`,
  `TARGET // ${TARGET_APY}%`,
  "NO CUSTODY // NON-CUSTODIAL",
  CONFIG_READY ? "STAKING // CONFIGURED" : "STAKING // AWAITING POOL",
];

export function Home() {
  return (
    <>
      <Hero />
      <Ticker />
      <FileSection />
      <ArchiveSection />
      <TokenSection />
      <ClosingSection />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.35]" />
      <div
        className="pointer-events-none absolute -right-16 top-10 select-none font-display text-[34vw] font-bold leading-none text-white/[0.018]"
        aria-hidden="true"
      >
        106
      </div>

      <div className="shell relative pb-14 pt-12 sm:pt-16 lg:pb-20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse-dot" />
            FILE 106 // ACCESS: PUBLIC
          </span>
          <span>SOLANA / {CLUSTER_LABEL} / ARCHIVE NODE 01</span>
        </div>

        <div className="mt-10 grid items-end gap-12 lg:grid-cols-[1.22fr_0.78fr]">
          <div className="animate-fade-up">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="chip border-acid/30 text-acid">DECLASSIFIED</span>
              <span className="chip">EST. 2026</span>
              <span className="chip">NO CUSTODY</span>
            </div>

            <h1 className="font-display text-[clamp(3.9rem,10.6vw,9rem)] font-bold leading-[0.84] tracking-[-0.055em]">
              CHILL
              <span className="text-acid animate-glitch" style={{ display: "inline-block" }}>
                106
              </span>
            </h1>

            <div className="mt-7 flex items-center gap-4">
              <span className="h-px w-10 bg-acid/60" />
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink sm:text-xs">
                THE CHILL IS IN THE FILE.
              </p>
            </div>

            <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              A restricted archive recovered from the quiet side of Solana. One file,
              one signal, one reward terminal. Read the record. Lock your file. Wait
              for the unlock.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/staking" className="btn-primary px-6 py-4">
                ENTER STAKING TERMINAL <span aria-hidden="true">↗</span>
              </Link>
              <a href="#file" className="btn-outline px-6 py-4">
                READ THE FILE
              </a>
            </div>
          </div>

          <HeroTerminal />
        </div>

        <div className="mt-12 grid grid-cols-2 gap-px border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
          <HeroStat label="TARGET APY" value={`${TARGET_APY}%`} sub="CONFIG / NOT A GUARANTEE" />
          <HeroStat label="LOCK TERM" value={`${STAKE_DURATION_DAYS}D`} sub="ON-CHAIN DURATION" />
          <HeroStat label="STAKING CAP" value={`${MAX_STAKE_CAP}`} sub={`${TOKEN_SYMBOL} MAXIMUM`} />
          <HeroStat
            label="REWARD BUDGET"
            value={`${MAX_REWARD_ALLOCATION}`}
            sub={`${TOKEN_SYMBOL} ALLOCATION`}
          />
        </div>
      </div>
    </section>
  );
}

function HeroTerminal() {
  const lines = [
    ["ARCHIVE NODE", "ONLINE"],
    ["SIGNAL ORIGIN", "UNRESOLVED"],
    ["FRAGMENTS INDEXED", "03 / 106"],
    ["MINT RECORD", CONFIG_READY ? shortKey(TOKEN_MINT?.toBase58(), 5, 5) : "PENDING DISCLOSURE"],
    ["STAKING CORE", CONFIG_READY ? "CONFIGURED" : "AWAITING POOL"],
  ];

  return (
    <div className="animate-fade-in lg:pb-2">
      <div className="terminal relative p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-acid/15 pb-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-acid">
            LIVE ARCHIVE FEED
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-widest text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> CONNECTED
          </span>
        </div>

        <div className="space-y-2.5">
          {lines.map(([label, value]) => (
            <div key={label} className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em]">
              <span className="text-acid/60">›</span>
              <span className="text-dim">{label}</span>
              <span className="flex-1 border-b border-dotted border-white/10" />
              <span className={value === "AWAITING POOL" ? "text-amber" : "text-ink"}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 h-14 overflow-hidden border border-white/[0.07] bg-black/30 px-2">
          <SignalBars />
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.18em] text-dim">
          <span>ENCRYPTION // AES-106</span>
          <span className="text-acid">▮▮▮▮▯</span>
        </div>
      </div>

      <p className="mt-3 text-right font-mono text-[8px] uppercase tracking-[0.2em] text-dim">
        SIGNAL IS NOT A PRICE. ARCHIVE IS NOT ADVICE.
      </p>
    </div>
  );
}

function SignalBars() {
  return (
    <div className="flex h-full items-end gap-1 py-2">
      {Array.from({ length: 48 }).map((_, index) => {
        const height = 12 + ((index * 37) % 34);
        return (
          <span
            key={index}
            className="w-full bg-acid/40"
            style={{
              height: `${height}%`,
              opacity: 0.18 + ((index * 13) % 70) / 100,
            }}
          />
        );
      })}
    </div>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-[#07090d] px-4 py-4">
      <div className="hud-micro">{label}</div>
      <div className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-dim">
        {sub}
      </div>
    </div>
  );
}

function Ticker() {
  const row = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-y border-white/[0.07] bg-white/[0.015] py-2.5">
      <div className="flex w-max animate-ticker items-center gap-8 whitespace-nowrap">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-8">
            {row.map((item, index) => (
              <span
                key={`${copy}-${index}`}
                className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted"
              >
                <span className="text-acid/70">◆</span>
                {item}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FileSection() {
  return (
    <section id="file" className="shell scroll-mt-24 py-20 sm:py-24">
      <SectionHeading index="01" label="THE FILE" title="A record with missing pages." />

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <p className="max-w-2xl font-display text-xl leading-relaxed text-ink/90 sm:text-2xl">
            FILE106 is the public-facing shell of an unfinished investigation. The
            archive holds fragments. The token holds the timestamp. The staking
            protocol holds the lock.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            There is no promise hidden in the typography. The interface reads the
            chain directly. If a pool is not configured, the terminal says so. If a
            lock is not expired, the chain refuses the exit. If a reward reserve is
            empty, there is nothing to claim.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["NO CUSTODY", "Keys stay in your wallet. The site never signs for you."],
              ["NO SYNTHETICS", "Staking uses Streamflow's deployed Solana programs."],
              ["NO OVERCLAIM", "Reward reserves are checked on-chain, not simulated."],
            ].map(([title, body]) => (
              <div key={title} className="border border-white/[0.08] bg-white/[0.015] p-4">
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-acid">
                  {title}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <Panel>
          <PanelHead
            label="DOSSIER // 106"
            right={<StatusChip tone="warn">OPEN</StatusChip>}
          />
          <div className="px-5 py-2">
            <RecordRow label="DESIGNATION" value="FILE106 / CHILL106" />
            <RecordRow label="NETWORK" value={`SOLANA / ${CLUSTER_LABEL}`} />
            <RecordRow label="ORIGIN" value="UNRESOLVED" />
            <RecordRow label="ACCESS" value="PUBLIC / STAKING RESTRICTED" />
            <RecordRow label="REDACTIONS" value="97 PAGES" />
            <RecordRow
              label="TOKEN RECORD"
              value={CONFIG_READY ? "PUBLISHED" : "PENDING DISCLOSURE"}
              accent={!CONFIG_READY}
            />
          </div>
          <div className="border-t border-white/[0.07] px-5 py-4 font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-dim">
            <span className="text-amber">NOTE //</span> Narrative archive only. Token
            metadata and pool parameters are published separately and must be verified
            on-chain.
          </div>
        </Panel>
      </div>
    </section>
  );
}

function RecordRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="row-line">
      <span className="hud-micro">{label}</span>
      <span
        className={`text-right font-mono text-[10px] uppercase tracking-[0.1em] ${
          accent ? "text-amber" : "text-ink/85"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ArchiveSection() {
  const fragments = [
    {
      id: "FRAGMENT 001",
      title: "THE QUIET BLOCK",
      status: "RECOVERED" as const,
      tone: "live" as const,
      body: "A block with no noise. The validators called it a coincidence. The archive called it a door.",
      mark: "01",
    },
    {
      id: "FRAGMENT 002",
      title: "COLD STORAGE",
      status: "SEALED" as const,
      tone: "warn" as const,
      body: "A wallet that never moved. A balance that never changed. A timestamp that should not exist.",
      mark: "02",
    },
    {
      id: "FRAGMENT 003",
      title: "THE 106TH SIGNAL",
      status: "REDACTED" as const,
      tone: "danger" as const,
      body: "The last page is missing. Whatever was written there is now the reason the terminal exists.",
      mark: "03",
    },
  ];

  return (
    <section id="archive" className="scroll-mt-24 border-y border-white/[0.07] bg-white/[0.012] py-20 sm:py-24">
      <div className="shell">
        <SectionHeading
          index="02"
          label="RECOVERED FRAGMENTS"
          title="Three pages survived. The rest did not."
          right={
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
              INDEX 03 / 106
            </span>
          }
        />

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {fragments.map((fragment) => (
            <article
              key={fragment.id}
              className="group relative overflow-hidden border border-white/[0.08] bg-[#080b10] p-5 transition-colors hover:border-acid/30"
            >
              <div className="pointer-events-none absolute -right-3 -top-6 font-display text-[88px] font-bold leading-none text-white/[0.025]">
                {fragment.mark}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
                  {fragment.id}
                </span>
                <StatusChip tone={fragment.tone}>{fragment.status}</StatusChip>
              </div>
              <h3 className="mt-8 font-display text-xl font-medium tracking-tight text-ink">
                {fragment.title}
              </h3>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">{fragment.body}</p>
              <div className="mt-6 space-y-2">
                <Redacted width="100%" />
                <Redacted width="72%" />
              </div>
              <div className="mt-5 font-mono text-[8px] uppercase tracking-[0.2em] text-dim">
                HASH // {fragment.mark}6F1A…<span className="text-acid/60">▮</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TokenSection() {
  return (
    <section id="token" className="shell scroll-mt-24 py-20 sm:py-24">
      <SectionHeading index="03" label="TOKEN RECORD" title="The record is thin on purpose." />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHead
            label="PUBLIC TOKEN RECORD"
            right={
              <StatusChip tone={CONFIG_READY ? "live" : "warn"}>
                {CONFIG_READY ? "PUBLISHED" : "PENDING"}
              </StatusChip>
            }
          />
          <div className="grid grid-cols-2 gap-px bg-white/[0.07]">
            <RecordCell label="TOKEN" value={TOKEN_SYMBOL} />
            <RecordCell label="NETWORK" value="SOLANA" />
            <RecordCell label="STANDARD" value="SPL TOKEN" />
            <RecordCell label="DECIMALS" value="8 (TARGET)" />
            <RecordCell label="MAX SUPPLY" value="NOT PUBLISHED" />
            <RecordCell label="MINT" value={CONFIG_READY ? shortKey(TOKEN_MINT?.toBase58(), 6, 6) : "PENDING DISCLOSURE"} />
            <RecordCell label="MINT AUTHORITY" value="VERIFY ON-CHAIN" />
            <RecordCell label="FREEZE AUTHORITY" value="VERIFY ON-CHAIN" />
          </div>
          <div className="border-t border-white/[0.07] px-5 py-4 font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-dim">
            <span className="text-amber">NOTE //</span> No mint address is hard-coded
            into this frontend. Publishing a wrong mint is worse than publishing none.
            The staking terminal validates the mint before it builds a transaction.
          </div>
        </Panel>

        <div className="terminal relative flex flex-col justify-between p-5 sm:p-7">
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-acid/15 pb-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-acid">
                STAKING PROTOCOL // 106
              </span>
              <StatusChip tone={CONFIG_READY ? "live" : "warn"}>
                {CONFIG_READY ? "READY" : "AWAITING POOL"}
              </StatusChip>
            </div>

            <h3 className="mt-7 max-w-md font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
              LOCK YOUR FILE.
              <br />
              <span className="text-acid">EARN YOUR REWARD.</span>
            </h3>

            <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MiniStat label="TARGET" value={`${TARGET_APY}%`} />
              <MiniStat label="TERM" value={`${STAKE_DURATION_DAYS}D`} />
              <MiniStat label="CAP" value={`${MAX_STAKE_CAP}`} />
              <MiniStat label="REWARD" value={`${MAX_REWARD_ALLOCATION}`} />
            </div>

            <div className="mt-7 space-y-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              <TerminalLine>REWARD MECHANIC // PERIODIC STREAMFLOW ACCRUAL</TerminalLine>
              <TerminalLine>CLAIM PATH // ON-CHAIN REWARD ENTRY</TerminalLine>
              <TerminalLine>UNSTAKE // REJECTED BEFORE DURATION</TerminalLine>
              <TerminalLine>
                STATE // {CONFIG_READY ? "POOL CONFIGURED" : "CONFIGURE MINT + POOL"}
              </TerminalLine>
            </div>
          </div>

          <div className="mt-8">
            <Link to="/staking" className="btn-primary w-full px-6 py-4 sm:w-auto">
              OPEN STAKING TERMINAL <span aria-hidden="true">↗</span>
            </Link>
            <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.18em] text-dim">
              TARGETS ARE CONFIGURATION // NOT A PROMISE OF RETURN
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RecordCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#080b10] px-4 py-4">
      <div className="hud-micro">{label}</div>
      <div className="mt-1.5 break-all font-mono text-[11px] text-ink/85">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-dim">{label}</div>
      <div className="mt-1 font-display text-xl font-medium text-acid">{value}</div>
    </div>
  );
}

function TerminalLine({ children }: { children: React.ReactNode }) {
  return <div className="terminal-line text-muted/90">{children}</div>;
}

function ClosingSection() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.07]">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="shell relative py-20 text-center sm:py-28">
        <div className="hud-label mb-5">FILE 106 // ACCESS GRANTED</div>
        <h2 className="mx-auto max-w-4xl text-balance font-display text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          THE FILE IS OPEN.
          <br />
          <span className="text-acid">THE TERMINAL IS WAITING.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-muted">
          Connect a Solana wallet, read the pool, and decide for yourself. The archive
          does not ask twice.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/staking" className="btn-primary px-7 py-4">
            STAKING PROTOCOL // 106 <span aria-hidden="true">↗</span>
          </Link>
          <a href={APP.repo} target="_blank" rel="noreferrer" className="btn-outline px-7 py-4">
            VIEW SOURCE ↗
          </a>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  index,
  label,
  title,
  right,
}: {
  index: string;
  label: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-4">
      <div>
        <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
          <span className="text-acid">{index}</span>
          <span>{label}</span>
          <span className="h-px w-8 bg-white/15" />
        </div>
        <h2 className="mt-3 max-w-2xl font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}
