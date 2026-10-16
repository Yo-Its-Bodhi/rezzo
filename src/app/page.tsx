import Image from "next/image";
import { ArrowDown, Clock3, Users } from "lucide-react";
import { BookingFlow } from "@/components/booking-flow";
import { SiteHeader } from "@/components/site-header";
import { ReservationFooter } from "@/components/reservation-footer";
import {
  RESERVATION_POLICIES,
  RESERVATION_POLICY_NOTE,
} from "@/lib/restaurant";
import { restaurantDate } from "@/lib/booking-ui";

// Date limits follow the Toronto calendar on each request, rather than build day.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="guest-page">
      <a className="reservation-skip" href="#booking">
        Skip to booking
      </a>
      <SiteHeader />
      <main className="reservation-layout">
        <section
          className="reservation-intro"
          aria-labelledby="reservation-title"
        >
          <div className="reservation-intro-copy">
            <p className="reservation-eyebrow">
              YOUR NIGHT STARTS ON DUNDAS WEST
            </p>
            <h1 id="reservation-title">
              GOOD FOOD.
              <br />
              BETTER COMPANY.
            </h1>
            <p>
              Mexican corn. Tortillas made here every day. Pull up a chair.
              We’ll take care of the tacos.
            </p>
            <a href="#booking" className="reservation-mobile-jump">
              Find your table <ArrowDown size={16} aria-hidden="true" />
            </a>
            <div className="reservation-facts">
              <span>
                <Users size={16} aria-hidden="true" />
                1–6 guests
              </span>
              <span>
                <Clock3 size={16} aria-hidden="true" />
                Two hours. Make them count.
              </span>
            </div>
          </div>
          <figure className="reservation-food">
            <Image
              src="/images/tacos-serape-960.webp"
              alt="Three freshly made La Chingada tacos on a colourful Mexican textile"
              width={960}
              height={541}
              priority
              sizes="(max-width: 850px) 100vw, 45vw"
            />
            <figcaption>THE TABLE IS YOURS. THE TORTILLAS ARE OURS.</figcaption>
          </figure>
          <details className="reservation-house-rules">
            <summary>
              Before we save you a seat <span aria-hidden="true">+</span>
            </summary>
            <ul>
              {RESERVATION_POLICIES.map((policy) => (
                <li key={policy}>{policy}</li>
              ))}
            </ul>
            <p>{RESERVATION_POLICY_NOTE}</p>
          </details>
        </section>
        <div className="reservation-form-wrap" id="booking">
          <BookingFlow
            initialToday={restaurantDate()}
            initialDate={restaurantDate(1)}
            finalDate={restaurantDate(60)}
          />
        </div>
      </main>
      <ReservationFooter />
    </div>
  );
}
