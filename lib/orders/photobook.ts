// Photo books are the one product a client can't fully specify in the portal:
// the receptionist calls the client to confirm details before the order goes
// anywhere (see placeOrder in app/client-side/actions.ts). Matched by the
// catalog category's name, same as the order form's ETA copy.
export function isPhotobookCategory(name: string | undefined | null): boolean {
  return (name ?? "").trim().toLowerCase() === "photo books";
}
