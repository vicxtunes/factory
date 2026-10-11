import { Button } from "@repo/ui/Button";
import { Confirmation } from "@repo/ui/Confirmation";

// The end of a sheet's task: what happened, what's next, the way on.
export default function ConfirmationBooked() {
  return (
    <div className="mx-auto max-w-sm rounded-3xl border border-border bg-surface p-5">
      <Confirmation title="You're booked" action={<Button className="min-h-12 w-full rounded-full">Done</Button>}>
        Gold with Dementa Studios on Sat 12 Dec. Paid UGX 500,000: your invoice shows the payment.
      </Confirmation>
    </div>
  );
}
