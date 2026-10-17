// The wallet's terms: what a business's owner agrees to before its Business
// card works and its customers are offered mobile money in the app. Pure;
// safe on client and server.
//
// Changing what the terms say: edit the sections and raise the version. Every
// business is then asked to agree again, and until it does its card is off.

import { MAX_WITHDRAWAL, MIN_WITHDRAWAL } from "./policy";

export const WALLET_TERMS_VERSION = 2;

export interface TermsSection {
  title: string;
  points: string[];
}

/** The terms for a business whose customer payments pay Aming `feePercent` (5 for a studio, 10 for a vendor). */
export const walletTerms = (feePercent: number): TermsSection[] => [
  {
    title: "What these terms cover",
    points: [
      "Your Business card: the money your customers pay your business in the Aming Space app by MTN or Airtel mobile money.",
      "Your own Aming card (what you hold with Aming for its orders and storage) carries on as before.",
    ],
  },
  {
    title: "Who holds the money",
    points: [
      "Payments your customers make in the app are collected by Aming's mobile money provider into Aming's account, and held there for your business until you transfer or withdraw them.",
      "A payment shows on your Business card between 5 minutes and 24 hours after your customer pays, because of network and security checks.",
      "The balance on your Business card is not a bank account and earns no interest.",
    ],
  },
  {
    title: "Withdrawals and transfers",
    points: [
      "Only the business's owner can withdraw from the Business card or move money between the two cards. Team members can't, whatever access you give them.",
      "A withdrawal is sent to the MTN or Airtel number you give, through our mobile money provider, once Aming has checked it. It leaves your card as soon as you ask, and reaches your phone between 5 minutes and 24 hours later. You're responsible for giving the right number.",
      `You can withdraw from UGX ${MIN_WITHDRAWAL.toLocaleString("en-UG")} to UGX ${MAX_WITHDRAWAL.toLocaleString("en-UG")} at a time (our provider's limits), and never more than is on your card.`,
      "If a withdrawal can't be sent, the money goes back on your card and you're told why.",
      "Money you move to your Aming card pays for Aming's orders and storage.",
    ],
  },
  {
    title: "Fees",
    points: [
      `Aming keeps ${feePercent}% of each payment your customers make to your business in the app. The whole payment and the fee both show in your card's history, and the rest stays on your card.`,
      "Our mobile money provider's fee for sending a withdrawal comes off what you receive, and is shown with the withdrawal once it's sent.",
      "We'll tell you before a fee is introduced or changed.",
    ],
  },
  {
    title: "Your customers",
    points: [
      "You're responsible for what you sell, and for agreeing any refund with your customer.",
      "Aming may hold or reverse a payment that was made in error, made twice, or made dishonestly. A reversal shows on your card between 5 minutes and 24 hours after it's decided, with its reason.",
    ],
  },
  {
    title: "Records and corrections",
    points: ["Every movement on your card is recorded, with who made it. A mistake is corrected with a new entry in the history, never by changing or removing an old one."],
  },
  {
    title: "If you don't agree",
    points: [
      "Your Business card stays off, and your customers aren't offered mobile money in the app for your business.",
      "You can still be paid directly (cash, your bank, your own mobile money) and record those payments on your invoices yourself.",
    ],
  },
  {
    title: "Changes to these terms",
    points: ["If these terms change, you'll be asked to agree again before your Business card carries on."],
  },
  {
    title: "The law",
    points: ["These terms are governed by the laws of Uganda."],
  },
];
