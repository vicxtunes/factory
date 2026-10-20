import { SocialIcon } from "@repo/ui/vendors/SocialIcon";

const NETWORKS = ["instagram", "tiktok", "facebook", "youtube", "x", "website"] as const;

// A handle is always shown with its network's icon.
export default function SocialIconAll() {
  return (
    <div className="flex flex-wrap gap-2">
      {NETWORKS.map((n) => (
        <span key={n} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm">
          <SocialIcon network={n} className="size-4" />
          {n === "website" ? "kato.ug" : "@kato.edits"}
        </span>
      ))}
    </div>
  );
}
