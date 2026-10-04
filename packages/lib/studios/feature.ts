// Studios are switched on per deployment until there is enough of them to
// release: set NEXT_PUBLIC_STUDIOS=1 (the preview has it; production doesn't
// yet). Read at build time, so it is safe in client components.
export const STUDIOS_ENABLED = process.env.NEXT_PUBLIC_STUDIOS === "1";
