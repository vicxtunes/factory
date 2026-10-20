import { redirect } from "next/navigation";

// Editing a booking opens over the booking now; old links land there.
export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/studio/bookings/${encodeURIComponent((await params).id)}?edit`);
}
