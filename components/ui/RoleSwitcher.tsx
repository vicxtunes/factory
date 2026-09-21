import Link from "next/link";

const ROLES = [
  { href: "/factory", label: "Factory", who: "Workers" },
  { href: "/graphics", label: "Graphics", who: "Graphic designers" },
  { href: "/dashboard/login", label: "Dashboard", who: "Receptionist, supervisor & boss" },
] as const;

export function RoleSwitcher({ current }: { current: (typeof ROLES)[number]["href"] }) {
  const others = ROLES.filter((r) => r.href !== current);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
      <span>Not you?</span>
      {others.map((r) => (
        <Link key={r.href} href={r.href} className="font-medium text-brand-600 hover:underline">
          {r.label} <span className="font-normal text-muted">({r.who})</span>
        </Link>
      ))}
    </div>
  );
}
