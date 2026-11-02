import { DayBookBoard } from "@repo/ui/books/DayBookBoard";
import type { DayBook } from "@repo/lib/books/model";

const SAMPLE: DayBook = {
  day: "2026-11-03",
  today: "2026-11-03",
  close: null,
  lastClosedDay: "2026-11-02",
  accounts: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Cash", kind: "cash", opening: 240_000, moneyIn: 150_000, moneyOut: 35_000, expected: 355_000, counted: null, difference: null, closing: 355_000 },
    { id: "00000000-0000-4000-8000-000000000002", name: "Bank", kind: "bank", opening: 1_200_000, moneyIn: 0, moneyOut: 0, expected: 1_200_000, counted: null, difference: null, closing: 1_200_000 },
    { id: "00000000-0000-4000-8000-000000000003", name: "Mobile money", kind: "mobile_money", opening: 610_000, moneyIn: 652_500, moneyOut: 50_000, expected: 1_212_500, counted: null, difference: null, closing: 1_212_500 },
  ],
  lines: [
    { id: "a", direction: "in", kind: "sale_receipt", at: "2026-11-03T06:40:00Z", amount: 652_500, accountId: "00000000-0000-4000-8000-000000000003", method: "mobile_money", party: "Sample Studio", senderName: "Sam Okello", phone: "0700 000 000", reference: "14567890", detail: "Order 2026-0521", recordedBy: "Carol", recordedAt: "2026-11-03T06:41:00Z", late: false },
    { id: "b", direction: "in", kind: "prepayment", at: "2026-11-03T08:10:00Z", amount: 150_000, accountId: "00000000-0000-4000-8000-000000000001", method: "cash", party: "Sample Photos", senderName: "Sample Photos", phone: null, reference: null, detail: "Wallet top-up", recordedBy: "Carol", recordedAt: "2026-11-03T08:11:00Z", late: false },
    { id: "c", direction: "out", kind: "materials", at: "2026-11-03T09:30:00Z", amount: 35_000, accountId: "00000000-0000-4000-8000-000000000001", method: "cash", party: "Paper supplier", senderName: null, phone: null, reference: null, detail: "Materials: Photo paper", recordedBy: "Dementa", recordedAt: "2026-11-03T09:31:00Z", late: false },
    { id: "d", direction: "out", kind: "loan_repayment", at: "2026-11-03T11:00:00Z", amount: 50_000, accountId: "00000000-0000-4000-8000-000000000003", method: "mobile_money", party: "Sample SACCO", senderName: null, phone: "0700 000 001", reference: "98765", detail: "Loan repayment", recordedBy: "Dementa", recordedAt: "2026-11-03T11:01:00Z", late: false },
  ],
};

// Accounts → Today on a sample day, ready to close.
export default function BooksDayBook() {
  return <DayBookBoard book={SAMPLE} timeZone="Africa/Kampala" />;
}
