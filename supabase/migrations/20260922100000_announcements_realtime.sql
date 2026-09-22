-- Factory Order Tracker — real-time announcement popups
--
-- announcements was never added to the Realtime publication, so a new (or
-- newly-activated) announcement only ever reached someone already signed in
-- on their *next* page load, not while they were sitting on the app —
-- AnnouncementPopup now subscribes to this table (see
-- components/announcements/AnnouncementPopup.tsx).

alter publication supabase_realtime add table announcements;
