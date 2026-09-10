import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

export function SiteHeader({ staff = false }: { staff?: boolean }) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        LA CHINGADA <span aria-hidden>✦</span>
      </Link>
      <div className="header-actions">
        <span className="status-stamp">{staff ? "STAFF MODE" : "DUNDAS WEST"}</span>
        {staff ? (
          <>
            <Link className="header-link" href="/">Guest view</Link>
            <LogoutButton />
          </>
        ) : null}
      </div>
    </header>
  );
}
