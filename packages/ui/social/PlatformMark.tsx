import { SocialIcon } from "@repo/ui/vendors/SocialIcon";
import { platformName } from "@repo/lib/social/core";

/** A platform's mark (the ones without a drawn mark: their first letters). */
export function PlatformMark({ platform, className = "size-5" }: { platform: string; className?: string }) {
  const net = platform === "twitter" ? "x" : platform;
  if (net === "instagram" || net === "tiktok" || net === "facebook" || net === "youtube" || net === "x") return <SocialIcon network={net} className={className} />;
  return (
    <span className={`${className} inline-flex items-center justify-center rounded bg-gray-200 text-[10px] font-bold text-gray-700 dark:bg-white/10 dark:text-gray-200`}>
      {platformName(platform).slice(0, 2)}
    </span>
  );
}
