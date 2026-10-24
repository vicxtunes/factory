// The page behind a pop-up stays put while it's open. Pop-ups can be open
// together (a sheet over the photo viewer) and close in any order, so the
// lock is counted: the page scrolls again once the last one has closed. Each
// pop-up putting back what it found instead could leave a page locked for
// good once two overlapped.

let held = 0;

/** Locks page scrolling; returns the unlock (safe to call twice). */
export function lockPageScroll(): () => void {
  if (held++ === 0) document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--held === 0) document.body.style.overflow = "";
  };
}
