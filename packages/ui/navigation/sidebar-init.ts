// Runs in <head> before the page paints (each app's root layout), so a
// collapsed sidebar doesn't open wide for a moment and then snap shut.
// Kept in sync with STORAGE_KEY in ./sidebar.tsx.
export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem("sidebar-collapsed")==="1")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
