// The editor's icons: one line style, 24px grid, stroke follows the text colour.

import type { ReactNode } from "react";

const I = ({ children, className = "size-5", fill }: { children: ReactNode; className?: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
type P = { className?: string };

export const Close = (p: P) => <I {...p}><path d="M18 6 6 18M6 6l12 12" /></I>;
export const Back = (p: P) => <I {...p}><path d="m15 18-6-6 6-6" /></I>;
export const Check = (p: P) => <I {...p}><path d="M20 6 9 17l-5-5" /></I>;
export const Play = (p: P) => <I {...p} fill><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></I>;
export const Pause = (p: P) => <I {...p} fill><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></I>;
export const Undo = (p: P) => <I {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></I>;
export const Redo = (p: P) => <I {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></I>;
export const Scissors = (p: P) => <I {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" /></I>;
export const Split = (p: P) => <I {...p}><path d="M12 3v18" /><path d="M8 7H4v10h4M16 7h4v10h-4" /></I>;
export const Trash = (p: P) => <I {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></I>;
export const Copy = (p: P) => <I {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></I>;
export const Volume = (p: P) => <I {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></I>;
export const Mute = (p: P) => <I {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m22 9-6 6M16 9l6 6" /></I>;
export const Music = (p: P) => <I {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></I>;
export const Text = (p: P) => <I {...p}><path d="M4 7V4h16v3M9 20h6M12 4v16" /></I>;
export const Filters = (p: P) => <I {...p}><circle cx="9" cy="9" r="6" /><circle cx="15" cy="9" r="6" /><circle cx="12" cy="15" r="6" /></I>;
export const Adjust = (p: P) => <I {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></I>;
export const Ratio = (p: P) => <I {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10v4h3M17 14v-4h-3" /></I>;
export const Sticker = (p: P) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M14 21v-3a4 4 0 0 1 4-4h3" /></I>;
export const Edit = (p: P) => <I {...p}><path d="M14 4 4 14v6h6L20 10" /><path d="m13 5 6 6" /></I>;
export const Transition = (p: P) => <I {...p}><path d="M3 5h7v14H3zM14 5h7v14h-7" /><path d="m8 12 8 0M13 9l3 3-3 3" /></I>;
export const Animate = (p: P) => <I {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></I>;
export const Style = (p: P) => <I {...p}><path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></I>;
export const ArrowLeft = (p: P) => <I {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></I>;
export const ArrowRight = (p: P) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>;
export const Plus = (p: P) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
export const Download = (p: P) => <I {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></I>;
export const Extract = (p: P) => <I {...p}><path d="M3 6h18M3 12h8M3 18h8" /><path d="M17 11v9M14 17l3 3 3-3" /></I>;
export const Timer = (p: P) => <I {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></I>;
export const Replace = (p: P) => <I {...p}><path d="M4 7h13l-3-3M20 17H7l3 3" /></I>;
export const ZoomIn = (p: P) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></I>;
export const ZoomOut = (p: P) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" /></I>;
