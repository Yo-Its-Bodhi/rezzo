import Link from "next/link";

export function SiteHeader({ staff = false }: { staff?: boolean }) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        LA CHINGADA <span aria-hidden>✦</span>
      </Link>
      <div className="header-actions">
        <span className="status-stamp">{staff ? "STAFF MODE" : "DUNDAS WEST"}</span>
        <Link className="header-link" href={staff ? "/" : "/admin"}>
          {staff ? "Guest view" : "Staff"}
        </Link>
      </div>
    </header>
  );
}
