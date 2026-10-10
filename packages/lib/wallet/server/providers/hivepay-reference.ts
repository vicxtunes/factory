// The reference HivePay carries for a collection. HivePay allows at most 30
// characters, letters and digits — our collection ids are 36-character
// uuids — so the same 128 bits go as base 36 behind an "AM" prefix (27 at
// most) and are turned back into the uuid when HivePay reports. Pure, so it
// can be tested.

const PREFIX = "AM";

export function toHivepayReference(collectionId: string): string {
  return PREFIX + BigInt(`0x${collectionId.replace(/-/g, "")}`).toString(36);
}

/** The collection id a HivePay reference stands for, or null when it isn't one of ours. */
export function fromHivepayReference(reference: string): string | null {
  const m = /^AM([0-9a-z]{1,25})$/i.exec(reference.trim());
  if (!m) return null;
  let n = BigInt(0);
  for (const ch of m[1].toLowerCase()) n = n * BigInt(36) + BigInt(parseInt(ch, 36));
  const hex = n.toString(16);
  if (hex.length > 32) return null;
  const h = hex.padStart(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
