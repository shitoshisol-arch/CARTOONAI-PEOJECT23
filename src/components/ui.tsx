import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clamp } from "../lib/format";

export function Panel({
  children,
  className = "",
  quiet = false,
}: {
  children: ReactNode;
  className?: string;
  quiet?: boolean;
}) {
  return (
    <section className={`panel ${quiet ? "panel-quiet" : ""} ${className}`}>
      {children}
    </section>
  );
}

export function PanelHead({
  label,
  right,
  title,
}: {
  label: string;
  right?: ReactNode;
  title?: string;
}) {
  return (
    <div className="panel-head">
      <div className="w-0 min-w-0 flex-1">
        <div className="hud-label">{label}</div>
        {title ? (
          <div className="mt-1 truncate font-display text-sm text-ink">{title}</div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function StatCell({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="stat-cell">
      <div className="hud-micro">{label}</div>
      <div
        className={`mt-1.5 font-display text-lg font-medium tracking-tight sm:text-xl ${
          accent ? "text-acid" : "text-ink"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 font-mono text-[9px] text-dim">{sub}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "acid",
  label,
}: {
  value: number;
  tone?: "acid" | "amber" | "ice";
  label?: string;
}) {
  const colors = {
    acid: "bg-acid",
    amber: "bg-amber",
    ice: "bg-ice",
  };
  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
          <span>{label}</span>
          <span>{clamp(value, 0, 100).toFixed(0)}%</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden bg-white/[0.06]">
        <div
          className={`h-full ${colors[tone]} transition-[width] duration-700`}
          style={{ width: `${clamp(value, 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

export type StatusTone = "live" | "warn" | "danger" | "neutral";

export function StatusChip({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  const styles: Record<StatusTone, string> = {
    live: "border-ok/30 text-ok bg-ok/[0.04]",
    warn: "border-amber/30 text-amber bg-amber/[0.05]",
    danger: "border-danger/30 text-danger bg-danger/[0.05]",
    neutral: "border-white/12 text-muted bg-white/[0.02]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${styles[tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "live"
            ? "bg-ok animate-pulse-dot"
            : tone === "warn"
              ? "bg-amber"
              : tone === "danger"
                ? "bg-danger"
                : "bg-dim"
        }`}
      />
      {children}
    </span>
  );
}

export function Notice({
  tone = "warn",
  label,
  children,
}: {
  tone?: "warn" | "danger" | "info" | "ok";
  label: string;
  children: ReactNode;
}) {
  const styles = {
    warn: "border-amber/25 bg-amber/[0.045] text-amber",
    danger: "border-danger/25 bg-danger/[0.045] text-danger",
    info: "border-ice/20 bg-ice/[0.035] text-ice",
    ok: "border-ok/25 bg-ok/[0.04] text-ok",
  };
  return (
    <div className={`border px-4 py-3 ${styles[tone]}`}>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em]">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted">
        {children}
      </div>
    </div>
  );
}

export function CopyValue({
  value,
  display,
  label,
}: {
  value: string;
  display?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label ? <span className="hud-micro shrink-0">{label}</span> : null}
      <code className="truncate font-mono text-[10px] text-muted" title={value}>
        {display ?? value}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
        }}
        className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-dim transition-colors hover:text-acid"
        aria-label="Copy value"
      >
        COPY
      </button>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="hud-label text-acid">{eyebrow}</p>
            <h2 className="mt-2 font-display text-2xl font-medium tracking-tight">
              {title}
            </h2>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Redacted({ width = "8ch" }: { width?: string }) {
  return <span className="redact" style={{ width }} aria-label="redacted" />;
}
