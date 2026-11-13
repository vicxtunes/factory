// What each staff member may use in the dashboard (owner, 2026-11-13). Pure.
//
// The dashboard is split into sections; each person has none, view or manage
// on each. Their role gives a starting set (staff_roles.access) and the boss
// can raise or lower any section for one person (profiles.access_overrides).
// The boss always has everything, and Team & access is the boss's alone.
// Dashboard, Chat, Showroom, Support and the display screen are everyone's.

export const LEVELS = ["none", "view", "manage"] as const;
export type Level = (typeof LEVELS)[number];

export interface SectionInfo {
  label: string;
  group: SectionGroup;
  /** What "view" gives; null when the section is on or off (none or manage). */
  view: string | null;
  manage: string;
}

export type SectionGroup = "Orders" | "Money" | "Production" | "Catalog & marketing" | "People" | "Tools";
export const SECTION_GROUPS: SectionGroup[] = ["Orders", "Money", "Production", "Catalog & marketing", "People", "Tools"];

export const SECTIONS = {
  orders: {
    label: "Orders",
    group: "Orders",
    view: "See office and client orders",
    manage: "Take, edit, price, assign and route orders",
  },
  order_admin: {
    label: "Cancel & delete",
    group: "Orders",
    view: "See an order's history (Show logs)",
    manage: "Also cancel orders and delete clients",
  },
  invoices: {
    label: "Invoices & payments",
    group: "Money",
    view: "See invoices",
    manage: "Record payments and pay invoices from wallets",
  },
  wallets: {
    label: "Wallets & transactions",
    group: "Money",
    view: "See wallets and transactions",
    manage: "Deposits, wallet changes and withdrawals",
  },
  accounts: {
    label: "Accounts",
    group: "Money",
    view: "See the money: overview, Today, payments, sales, what's owed",
    manage: "Close the day, record other money, move money between accounts, invoice settings and payment reminders",
  },
  expenses: {
    label: "Expenses",
    group: "Money",
    view: "See expenses and bills",
    manage: "Record expenses and payments made (big ones wait for approval)",
  },
  bill_approval: {
    label: "Approve & pay bills",
    group: "Money",
    view: null,
    manage: "Approve or reject expenses, send bills by mobile money, autopay and limits",
  },
  vendor_jobs: {
    label: "Vendor jobs",
    group: "Money",
    view: "See studios' vendor jobs",
    manage: "Settle disputes",
  },
  production: {
    label: "Production costs",
    group: "Production",
    view: "See materials, product costs and speed",
    manage: "Change materials, stock and recipes",
  },
  workers: {
    label: "Workers",
    group: "Production",
    view: "See workers",
    manage: "Edit workers and their stations",
  },
  worker_logins: {
    label: "Worker sign-ins",
    group: "Production",
    view: null,
    manage: "Add workers, set PINs, stop or restart them",
  },
  designers: {
    label: "Designers",
    group: "Production",
    view: "See designers",
    manage: "Add designers, set PINs, stop or restart them",
  },
  stations: {
    label: "Stations",
    group: "Production",
    view: "See stations",
    manage: "Add, rename and delete stations",
  },
  catalog: {
    label: "Products & prices",
    group: "Catalog & marketing",
    view: "See products and prices",
    manage: "Change categories, products, prices, photos, currencies and selling prices",
  },
  carousel: {
    label: "Carousel",
    group: "Catalog & marketing",
    view: "See the slides",
    manage: "Add, change and remove slides",
  },
  discounts: {
    label: "Discounts & top-up bonus",
    group: "Catalog & marketing",
    view: "See discounts and bonuses",
    manage: "Start, change and end them",
  },
  announcements: {
    label: "Announcements",
    group: "Catalog & marketing",
    view: "See announcements",
    manage: "Write their own (the boss approves them)",
  },
  clients: {
    label: "Clients",
    group: "People",
    view: "See clients",
    manage: "Add, edit and import clients; check agents' clients",
  },
  agents: {
    label: "Agents",
    group: "People",
    view: "See agents and their clients",
    manage: "Register and edit agents, commission, rates, withdrawals, move or merge their clients",
  },
  studios: {
    label: "Businesses",
    group: "People",
    view: "See clients' businesses",
    manage: "Review businesses, their storage and the service templates",
  },
  alexis: {
    label: "Alexis settings",
    group: "Tools",
    view: null,
    manage: "Turn Alexis on or off, its price, limits and terms",
  },
} as const satisfies Record<string, SectionInfo>;

export type Section = keyof typeof SECTIONS;
export const SECTION_KEYS = Object.keys(SECTIONS) as Section[];

/** A section → level map, as stored: sections left out are none (a role) or the role's (a person). */
export type AccessMap = Partial<Record<Section, Level>>;
/** What a person ends up with: every section. */
export type Access = Record<Section, Level>;

const RANK: Record<Level, number> = { none: 0, view: 1, manage: 2 };

/** The levels a section offers: on/off sections have no view. */
export function levelsOf(section: Section): Level[] {
  return SECTIONS[section].view === null ? ["none", "manage"] : [...LEVELS];
}

/** A stored map, cleaned: unknown sections and levels dropped, view on an on/off section is none. */
export function cleanMap(raw: unknown): AccessMap {
  const out: AccessMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in SECTIONS) || !LEVELS.includes(value as Level)) continue;
    const section = key as Section;
    out[section] = levelsOf(section).includes(value as Level) ? (value as Level) : "none";
  }
  return out;
}

/** Everyone's sections: the boss has all; anyone else their role's, then their own. */
export function resolveAccess(isBoss: boolean, role: unknown, overrides: unknown): Access {
  const fromRole = cleanMap(role);
  const own = cleanMap(overrides);
  return Object.fromEntries(
    SECTION_KEYS.map((s) => [s, isBoss ? "manage" : (own[s] ?? fromRole[s] ?? "none")]),
  ) as Access;
}

/** Whether `access` reaches `section` at `level` or above. */
export function can(access: Access, section: Section, level: Exclude<Level, "none"> = "view"): boolean {
  return RANK[access[section]] >= RANK[level];
}

/** Sections whose level differs between two maps (for the history). */
export function changes(before: AccessMap, after: AccessMap): { section: Section; from: Level | undefined; to: Level | undefined }[] {
  return SECTION_KEYS.filter((s) => before[s] !== after[s]).map((s) => ({ section: s, from: before[s], to: after[s] }));
}
