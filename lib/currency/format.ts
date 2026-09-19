// The business prices in Ugandan shillings only. UGX has no minor unit in
// practice, so amounts render as whole numbers with thousands separators.
export function formatUgx(amount: number | null | undefined): string {
  return `USh ${Math.round(amount ?? 0).toLocaleString("en-UG")}`;
}
