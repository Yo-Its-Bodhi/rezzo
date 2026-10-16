import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Brand } from "@/components/brand";
import { restaurantLinks } from "@/lib/public-links";

export function SiteHeader({ staff = false }: { staff?: boolean }) {
  if (!staff)
    return (
      <header className="site-header reservation-header">
        <Link href="/" aria-label="La Chingada reservations home">
          <Brand />
        </Link>
        <nav aria-label="Reservation navigation">
          <a
            href={restaurantLinks.restaurantUrl}
            className="reservation-restaurant-link"
          >
            The restaurant <span aria-hidden="true">↗</span>
          </a>
          <Link href="/manage">Manage booking</Link>
        </nav>
      </header>
    );
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        LA CHINGADA <span aria-hidden>✦</span>
      </Link>
      <div className="header-actions">
        <span className="status-stamp">
          {staff ? "STAFF MODE" : "DUNDAS WEST"}
        </span>
        {staff ? (
          <>
            <Link className="header-link" href="/">
              Guest view
            </Link>
            <LogoutButton />
          </>
        ) : null}
      </div>
    </header>
  );
}
