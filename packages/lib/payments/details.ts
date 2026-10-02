// Where clients send money for their orders. Plain constants (no DB table,
// no boss-editable setting) — these change rarely enough that a code change
// is fine, and keeping them here means the Payment page and every order's
// "How to pay" section always show the same numbers.

export interface PaymentField {
  label: string;
  value: string;
  /** Show a copy button — for the values people actually type into their banking/MoMo app. */
  copyable?: boolean;
}

export interface PaymentMethod {
  id: "bank" | "mobile_money";
  title: string;
  fields: PaymentField[];
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "bank",
    title: "Bank transfer / deposit",
    fields: [
      { label: "Bank", value: "Stanbic Bank" },
      { label: "Account name", value: "SANIGET MULTIMEDIA (U) LIMITED", copyable: true },
      { label: "Account number", value: "9030028592336", copyable: true },
      { label: "Currency", value: "Uganda Shillings (UGX)" },
    ],
  },
  {
    id: "mobile_money",
    title: "Mobile money",
    fields: [
      { label: "Number", value: "0700768312", copyable: true },
      { label: "Name", value: "Arthur Sembatya" },
    ],
  },
];
