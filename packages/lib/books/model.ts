// The business's own books: money in that isn't from a client. Pure.

export type OtherMoneyKind = "owner" | "other_income" | "other";
/** Money borrowed shows here too; it's recorded on Money we owe. */
export type OtherMoneyLineKind = OtherMoneyKind | "loan";

export const OTHER_MONEY_LABELS: Record<OtherMoneyLineKind, string> = {
  owner: "Owners' money",
  other_income: "Other income",
  other: "Other",
  loan: "Money borrowed",
};

export interface OtherMoneyLine {
  id: string;
  kind: OtherMoneyLineKind;
  amount: number;
  senderName: string;
  senderPhone: string | null;
  method: string;
  reference: string | null;
  receivedOn: string;
  accountName: string | null;
  note: string | null;
  recordedBy: string;
}
