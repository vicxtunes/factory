// The team module's records. Pure; safe on client and server.
//
// The people a business assigns work to. No logins yet: a member is a name
// to put on a task. Every member belongs to one tenant.

export interface TeamMemberInput {
  name: string;
  phone: string | null;
  /** What they do: "Second shooter", "Editor", … */
  role: string | null;
}

export interface TeamMember extends TeamMemberInput {
  id: string;
  /** Archived members aren't offered for new tasks but keep their history. */
  archivedAt: string | null;
}
