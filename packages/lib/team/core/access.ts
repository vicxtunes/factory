// What a team member may use in the studio they work for. Pure.
//
// The owner gives each member none, view or manage on each of the studio's
// areas (owner, 2026-11-13): their role's set (the business's own roles,
// team_access_roles), with single areas changed for them on top. With none,
// a member sees only the tasks given to them. The owner always has
// everything, including what's never given: the team, the business profile,
// its password, brand and document settings.

/** The parts of a studio a member can be given. */
export const AREAS = ["bookings", "projects", "clients", "money", "catalog", "files"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABELS: Record<Area, { label: string; hint: string }> = {
  bookings: { label: "Bookings", hint: "The calendar, bookings and clients' booking requests" },
  projects: { label: "Projects & tasks", hint: "Every project, its photos and tasks" },
  clients: { label: "Clients", hint: "The client list, their details and their page links" },
  money: { label: "Money", hint: "Quotations, invoices, payments, order requests and the accounts" },
  catalog: { label: "Packages, products & showroom", hint: "What the studio sells and its public albums" },
  files: { label: "Files", hint: "The studio's stored files and folders" },
};

export const LEVELS = ["none", "view", "manage"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = { none: "None", view: "View", manage: "Manage" };

/** An area → level map as stored: areas left out are none (a role) or the role's (a member). */
export type AreaMap = Partial<Record<Area, Level>>;
/** What a member ends up with: every area. */
export type AreaLevels = Record<Area, Level>;

/** A business's role: a name and its areas. */
export interface AccessRole {
  id: string;
  name: string;
  access: AreaMap;
}

/** The roles a business starts with (what the old choices gave), for the owner to change. */
export const STARTER_ROLES: { name: string; access: AreaMap }[] = [
  { name: "Manager", access: Object.fromEntries(AREAS.map((a) => [a, "manage"])) as AreaMap },
  { name: "Accounts", access: { clients: "manage", money: "manage" } },
  { name: "Tasks only", access: {} },
];

/** A stored map, cleaned: unknown areas and levels dropped. */
export function cleanAreas(raw: unknown): AreaMap {
  const out: AreaMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if ((AREAS as readonly string[]).includes(key) && (LEVELS as readonly string[]).includes(value as string)) out[key as Area] = value as Level;
  }
  return out;
}

/** A member's areas: their role's, then their own. */
export function resolveAreas(role: unknown, own: unknown): AreaLevels {
  const fromRole = cleanAreas(role);
  const mine = cleanAreas(own);
  return Object.fromEntries(AREAS.map((a) => [a, mine[a] ?? fromRole[a] ?? "none"])) as AreaLevels;
}

/** Who's in a studio's workspace: its owner, or one of its team with their areas. */
export type StudioAccess = { owner: true } | { owner: false; memberId: string; areas: AreaLevels };

const RANK: Record<Level, number> = { none: 0, view: 1, manage: 2 };

/**
 * Whether `access` reaches `area` at `level` (view: see it; manage: change
 * it). No area means owner-only (the team, the business settings): a member
 * never reaches those.
 */
export function canUse(access: StudioAccess, area?: Area, level: Exclude<Level, "none"> = "view"): boolean {
  if (access.owner) return true;
  return area !== undefined && RANK[access.areas[area]] >= RANK[level];
}

/** How long an invite link works. */
export const INVITE_DAYS = 7;
