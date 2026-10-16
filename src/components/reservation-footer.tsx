import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import { CornMark } from "./brand";

export function ReservationFooter() {
  return (
    <footer className="reservation-footer">
      <div>
        <CornMark />
        <span>
          MEXICAN CORN.
          <br />
          TORONTO HANDS.
        </span>
      </div>
      <a
        href="https://www.google.com/maps/search/?api=1&query=La+Chingada+1242+Dundas+Street+West+Toronto"
        target="_blank"
        rel="noopener noreferrer"
      >
        <MapPin size={16} aria-hidden="true" />
        1242 Dundas Street West, Toronto
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      <a href="tel:+14165352242">
        <Phone size={16} aria-hidden="true" />
        (416) 535-2242
      </a>
    </footer>
  );
}
