// The team module's records. Pure; safe on client and server.
//
// The people a business gives work to. A member is a name to put on a task,
// and can be given a login: invited by link, they join with their own Aming
// account and use the parts of the studio they were given (./access.ts).
// Every member belongs to one tenant.

import type { Area } from "./access";

export interface TeamMemberInput {
  name: string;
  phone: string | null;
  /** What they do: "Second shooter", "Editor", … */
  role: string | null;
}

export interface TeamMember extends TeamMemberInput {
  id: string;
  /** Archived members aren't offered for new tasks, keep their history, and can't sign in. */
  archivedAt: string | null;
  /** Whether an Aming account has joined as them (so they can sign in). */
  joined: boolean;
  /** The parts of the studio they may use; none: only their own tasks. */
  access: Area[];
  /** Their invite link's secret and when it stops working, while there's one. */
  invite: { token: string; expiresAt: string } | null;
}

/** A studio an Aming account works for, as one of its team. */
export interface Membership {
  tenantId: string;
  memberId: string;
  name: string;
  access: Area[];
}
