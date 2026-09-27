export function AnnouncementsPanel({
  announcements,
  currentUserId,
  canApprove,
}: {
  announcements: Announcement[];
  currentUserId: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AuditActorType[]>([]);

  const mine = announcements.filter((a) => a.created_by_id === currentUserId);
  const others = announcements.filter((a) => a.created_by_id !== currentUserId);
  const awaiting = canApprove ? others.filter((a) => a.approval_status === "pending") : [];
  const otherList = canApprove ? others.filter((a) => a.approval_status !== "pending") : others;

  const hasAwaiting = awaiting.length > 0;
  const hasOthers = otherList.length > 0;

  function run(fn: () => Promise<Result>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function publish() {
    run(async () => {
      const res = await createAnnouncement({ title, body, audience });
      if (res.ok) {
        setTitle("");
        setBody("");
        setAudience([]);
      }
      return res;
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
      {/*
        Left column. `contents` on phones flattens this wrapper so the
        sections drop straight into the outer stack as siblings (and the
        `order-*` classes still sequence them); from lg up it becomes a real
        flex column beside the composer rail.
      */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
        {hasAwaiting ? (
          <div className="order-2">
            <Section title={`Awaiting your approval (${awaiting.length})`}>
              {awaiting.map((a) => (
                <OtherAnnouncement key={a.id} announcement={a} run={run} pending={pending} canApprove />
              ))}
            </Section>
          </div>
        ) : null}

        <div className="order-3">
          <Section title="Your announcements">
            {mine.length === 0 ? (
              <p className="text-sm text-muted">You haven&apos;t written any yet.</p>
            ) : (
              mine.map((a) => (
                <OwnAnnouncement key={a.id} announcement={a} run={run} pending={pending} needsApproval={!canApprove} />
              ))
            )}
          </Section>
        </div>

        {hasOthers ? (
          <div className="order-4">
            <Section title="From others" hint="Only the person who wrote an announcement can change it.">
              {otherList.map((a) => (
                <OtherAnnouncement key={a.id} announcement={a} run={run} pending={pending} canApprove={canApprove} />
              ))}
            </Section>
          </div>
        ) : null}
      </div>

      {/*
        Right rail — same `contents` trick so on phones the composer keeps
        its place at the top of the stack.
      */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
        <div className="order-1 space-y-3">
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <div>
              <p className="text-sm font-medium">New announcement</p>
              <p className="text-xs text-muted">
                Pops up once for whoever it concerns the next time they open the app, then never again for that person.
                {canApprove ? " Yours go live straight away." : " The boss approves it before it goes live."}
              </p>
            </div>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title…" />
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message…" rows={3} />
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Who it concerns (none selected = everyone)</p>
              <AudiencePicker value={audience} onChange={setAudience} />
            </div>
            <Button
              variant="primary"
              className="text-xs"
              loading={pending}
              disabled={pending || !title.trim() || !body.trim()}
              onClick={publish}
            >
              {canApprove ? "Publish" : "Send for approval"}
            </Button>
          </div>
          {error ? <p className="text-xs text-error-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}