"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Counts down and then replaces the current URL, so a dead link doesn't leave
// anyone stranded. The visible button on the page does the same thing sooner.
export function AutoRedirect({ to, seconds = 6 }: { to: string; seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const id = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (left <= 0) router.replace(to);
  }, [left, to, router]);

  return (
    <p className="text-xs text-muted" aria-live="polite">
      Taking you back automatically in {Math.max(left, 0)}s…
    </p>
  );
}
