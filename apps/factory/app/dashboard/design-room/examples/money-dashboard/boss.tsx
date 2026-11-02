import { MoneyDashboard } from "@repo/ui/money/MoneyDashboard";

// The bosses' money dashboard, on sample figures: this month against last,
// money in by channel, a year of cash flow and the latest payments.
const RECEIVED = [38, 41, 35, 52, 47, 44, 58, 61, 49, 55, 63, 42].map((m) => m * 1_000_000);
const SALES = [42, 39, 40, 55, 50, 48, 60, 66, 52, 58, 70, 47].map((m) => m * 1_000_000);

const PAYMENTS = [
  { client: "Grace Nakato", channel: "mobile_money", amount: 1_250_000, order: "AM-1042", at: "2026-10-31T09:14:00Z" },
  { client: "Okello Prints Ltd", channel: "bank_transfer", amount: 4_800_000, order: "AM-1039", at: "2026-10-31T07:40:00Z" },
  { client: "Sarah Namuli", channel: "cash", amount: 350_000, order: "AM-1041", at: "2026-10-30T15:22:00Z" },
  { client: "J.One Studios", channel: "mobile_money", amount: 58_000, order: null, at: "2026-10-30T11:05:00Z" },
  { client: "Kampala Bridal", channel: "card", amount: 2_100_000, order: "AM-1036", at: "2026-10-29T13:48:00Z" },
  { client: "Peter Ssempa", channel: "cash", amount: 600_000, order: "AM-1035", at: "2026-10-29T08:31:00Z" },
] as const;

export default function MoneyDashboardBoss() {
  return (
    <MoneyDashboard
      timeZone="Africa/Kampala"
      weOwe={{ owed: 2_724_000, overdue: 700_000, overdueCount: 1 }}
      view={{
        period: { preset: "this_month", from: null, to: null, fromDate: "2026-10-01", toDate: "2026-10-31" },
        received: { now: 42_000_000, before: 63_000_000 },
        sales: { now: 47_000_000, before: 45_500_000 },
        owed: { outstanding: 18_750_000, overdue: 6_200_000, overdueCount: 4 },
        byChannel: { cash: 9_400_000, mobile_money: 21_300_000, bank_transfer: 11_300_000, card: 0, other: 0 },
        series: RECEIVED.map((received, i) => ({ month: `${i < 2 ? 2025 : 2026}-${String(((i + 10) % 12) + 1).padStart(2, "0")}`, received, sales: SALES[i] })),
        payments: PAYMENTS.map((p, i) => ({
          id: String(i),
          receivedAt: p.at,
          customerId: String(i),
          customerName: p.client,
          channel: p.channel,
          amount: p.amount,
          kind: p.order ? "sale_receipt" : "prepayment",
          orderNo: p.order,
          reference: null,
          recordedBy: p.channel === "mobile_money" ? "HivePay" : "Reception",
        })),
      }}
    />
  );
}
