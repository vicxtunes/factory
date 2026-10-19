// The cookie that remembers a collapsed sidebar in this browser. Each app's
// root layout reads it and renders <html data-sidebar="collapsed">, so a
// collapsed sidebar is collapsed in the first paint (no script, no flicker);
// ./sidebar.tsx writes it.
export const SIDEBAR_COOKIE = "sidebar-collapsed";
