import { redirect } from "next/navigation";

// "New booking" opens over the calendar now; old links (with a day, a quotation or a client) land there.
export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ date?: string; quotation?: string; client?: string }> }) {
  const { date, quotation, client } = await searchParams;
  const params = new URLSearchParams({ new: "", ...(date ? { date } : {}), ...(quotation ? { quotation } : {}), ...(client ? { client } : {}) });
  redirect(`/studio/bookings?${params}`);
}
