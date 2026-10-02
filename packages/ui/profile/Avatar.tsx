import Image from "next/image";

import { canOptimizeImage } from "@repo/lib/storage/client";

// Shared profile-picture circle — an actual photo when one's set, else the
// same initial-letter circle every user-menu already used before this
// existed. sizeClassName carries the width/height/text-size together (not a
// numeric `size` prop) since Tailwind's JIT needs literal class names in
// source, not ones assembled at runtime.
export function Avatar({
  url,
  name,
  sizeClassName = "h-9 w-9 text-sm",
  className = "",
}: {
  url: string | null;
  name: string;
  sizeClassName?: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={80}
        height={80}
        unoptimized={!canOptimizeImage(url)}
        className={`shrink-0 rounded-full object-cover ${sizeClassName} ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-semibold text-white ${sizeClassName} ${className}`}
    >
      {initial}
    </span>
  );
}
