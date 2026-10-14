// The reference HivePay carries for one of our transactions. HivePay allows
// at most 30 characters, letters and digits — our ids are 36-character uuids
// — so the same 128 bits go as base 36 behind a prefix (27 at most): "AM" for
// a collection, "WD" for a withdrawal's payout. They're turned back into the
// uuid when HivePay reports. Pure, so it can be tested.

function encode(prefix: string, id: string): string {
  return prefix + BigInt(`0x${id.replace(/-/g, "")}`).toString(36);
}

function decode(prefix: string, reference: string): string | null {
  const m = new RegExp(`^${prefix}([0-9a-z]{1,25})$`, "i").exec(reference.trim());
  if (!m) return null;
  let n = BigInt(0);
  for (const ch of m[1].toLowerCase()) n = n * BigInt(36) + BigInt(parseInt(ch, 36));
  const hex = n.toString(16);
  if (hex.length > 32) return null;
  const h = hex.padStart(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const toHivepayReference = (collectionId: string): string => encode("AM", collectionId);

/** The collection id a HivePay reference stands for, or null when it isn't one of our collections. */
export const fromHivepayReference = (reference: string): string | null => decode("AM", reference);

export const toPayoutReference = (withdrawalId: string): string => encode("WD", withdrawalId);

/** The withdrawal id a HivePay reference stands for, or null when it isn't one of our payouts. */
export const fromPayoutReference = (reference: string): string | null => decode("WD", reference);
