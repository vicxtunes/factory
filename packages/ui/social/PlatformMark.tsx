import { SocialIcon } from "@repo/ui/vendors/SocialIcon";

// Each platform in its own colours: a rounded tile in the brand colour with
// the mark in white (the design room's Social icons, packages/ui/vendors/SocialIcon.tsx).

const BRAND: Record<string, string> = {
  facebook: "bg-[#1877F2]",
  instagram: "bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fd5949_45%,#d6249f_60%,#285AEB_90%)]",
  tiktok: "bg-black",
  linkedin: "bg-[#0A66C2]",
  youtube: "bg-[#FF0000]",
  threads: "bg-black",
  pinterest: "bg-[#E60023]",
  twitter: "bg-black",
};

const LINKEDIN =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z";

function Glyph({ platform, className }: { platform: string; className: string }) {
  if (platform === "linkedin")
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d={LINKEDIN} />
      </svg>
    );
  if (platform === "threads") return <span className="font-bold leading-none">@</span>;
  if (platform === "pinterest") return <span className="font-serif font-bold leading-none">P</span>;
  const net = platform === "twitter" ? "x" : platform;
  if (net === "instagram" || net === "tiktok" || net === "facebook" || net === "youtube" || net === "x") return <SocialIcon network={net} className={className} />;
  return <span className="font-bold leading-none">{platform.slice(0, 1).toUpperCase()}</span>;
}

/** The platform's tile; `size` in Tailwind units of the tile. */
export function PlatformMark({ platform, size = "md", className = "" }: { platform: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const box = { xs: "size-5 rounded-md text-[10px]", sm: "size-7 rounded-lg text-xs", md: "size-10 rounded-xl text-base", lg: "size-14 rounded-2xl text-xl" }[size];
  const icon = { xs: "size-3", sm: "size-4", md: "size-5", lg: "size-7" }[size];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center text-white ring-2 ring-surface ${BRAND[platform] ?? "bg-gray-500"} ${box} ${className}`}>
      <Glyph platform={platform} className={icon} />
    </span>
  );
}
