import { Spinner } from "@/components/ui/Spinner";

export default function SpinnerSizes() {
  return (
    <div className="flex items-center gap-4">
      <Spinner />
      <Spinner className="h-6 w-6 text-brand-500" />
      <Spinner className="h-8 w-8 text-muted" />
    </div>
  );
}
