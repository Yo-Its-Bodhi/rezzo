import { SiteHeader } from "@/components/site-header";
import { WaitlistResponse } from "@/components/waitlist-response";

export default async function WaitlistRespondPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="single-page-shell">
        <WaitlistResponse entryId={id ?? ""} />
      </main>
    </>
  );
}
