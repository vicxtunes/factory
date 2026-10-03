import { ProgressBar } from "@repo/ui/ProgressBar";

export default function ProgressBarComplete() {
  return <ProgressBar value={4} max={4} label="Subtasks done" showValue="fraction" className="max-w-xs" />;
}
