import { ProgressBar } from "@repo/ui/ProgressBar";

export default function ProgressBarWithValue() {
  return (
    <div className="max-w-xs space-y-3">
      <ProgressBar value={3} max={8} label="Subtasks done" showValue="fraction" />
      <ProgressBar value={3} max={8} label="Subtasks done" showValue="percent" />
    </div>
  );
}
