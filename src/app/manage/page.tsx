import { ManageBooking } from "@/components/manage-booking";
import { SiteHeader } from "@/components/site-header";

export default function ManagePage() {
  return (
    <>
      <SiteHeader />
      <main className="single-page-shell">
        <ManageBooking />
      </main>
    </>
  );
}
