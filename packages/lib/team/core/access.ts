// What a team member may use in the studio they work for. Pure.
//
// The owner gives each member some of the studio's areas. With none, a
// member sees only the tasks given to them. The owner always has everything,
// including what's never given: the team, the business profile, its password,
// brand and document settings.

/** The parts of a studio a member can be given. */
export const AREAS = ["bookings", "projects", "clients", "money", "catalog"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABELS: Record<Area, { label: string; hint: string }> = {
  bookings: { label: "Bookings", hint: "The calendar, bookings and clients' booking requests" },
  projects: { label: "Projects & tasks", hint: "Every project, its photos and tasks" },
  clients: { label: "Clients", hint: "The client list, their details and their page links" },
  money: { label: "Money", hint: "Quotations, invoices, payments, order requests and the accounts" },
  catalog: { label: "Packages, products & showroom", hint: "What the studio sells and its public albums" },
};

/** Ready-made choices; anything else is "custom". */
export const ACCESS_PRESETS = {
  manager: { label: "Manager", hint: "Runs the business for you: everything but the team and your business settings", areas: [...AREAS] },
  accounts: { label: "Accounts", hint: "Clients and money: quotations, invoices and payments", areas: ["clients", "money"] },
  tasks: { label: "Tasks only", hint: "Only the tasks you give them", areas: [] },
} satisfies Record<string, { label: string; hint: string; areas: Area[] }>;
export type AccessPreset = keyof typeof ACCESS_PRESETS | "custom";

/** The preset these areas make, else "custom". */
export function presetOf(areas: readonly Area[]): AccessPreset {
  const same = (preset: readonly Area[]) => preset.length === areas.length && preset.every((a) => areas.includes(a));
  return (Object.keys(ACCESS_PRESETS) as (keyof typeof ACCESS_PRESETS)[]).find((k) => same(ACCESS_PRESETS[k].areas)) ?? "custom";
}

/** Who's in a studio's workspace: its owner, or one of its team with their areas. */
export type StudioAccess = { owner: true } | { owner: false; memberId: string; areas: Area[] };

/**
 * Whether `access` reaches `area`. No area means owner-only (the team, the
 * business settings): a member never reaches those.
 */
export function canUse(access: StudioAccess, area?: Area): boolean {
  if (access.owner) return true;
  return area !== undefined && access.areas.includes(area);
}

/** How long an invite link works. */
export const INVITE_DAYS = 7;
