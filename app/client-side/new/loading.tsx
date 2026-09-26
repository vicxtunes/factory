import { FormSkeleton } from "@/components/skeletons/blocks";
import { ClientFrameSkeleton } from "@/components/skeletons/frames";

// New order form.
export default function ClientNewOrderLoading() {
  return (
    <ClientFrameSkeleton>
      <FormSkeleton fields={6} />
    </ClientFrameSkeleton>
  );
}
