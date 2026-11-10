import { Link } from "react-router-dom";
import { APP, CLUSTER_LABEL } from "../lib/config";

export function NotFound() {
  return (
    <div className="shell flex min-h-[62vh] flex-col items-center justify-center py-20 text-center">
      <div className="hud-label text-amber">ROUTE NOT FOUND // 404</div>
      <div className="mt-6 font-display text-[clamp(6rem,18vw,12rem)] font-bold leading-none tracking-[-0.06em] text-white/[0.08]">
        404
      </div>
      <h1 className="mt-2 font-display text-3xl font-medium tracking-tight sm:text-4xl">
        THIS PAGE IS NOT IN THE FILE.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        The archive has no record at this route on {CLUSTER_LABEL}. Return to the
        terminal and read from a page that exists.
      </p>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <Link to="/" className="btn-primary px-6 py-3.5">
          RETURN TO ARCHIVE
        </Link>
        <Link to={APP.route} className="btn-outline px-6 py-3.5">
          STAKING TERMINAL ↗
        </Link>
      </div>
    </div>
  );
}
