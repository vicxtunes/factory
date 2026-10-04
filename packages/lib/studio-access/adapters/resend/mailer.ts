import "server-only";

// This app's Mailer: Resend's HTTP API (no SDK). Settings, on both Vercel
// projects:
//   RESEND_API_KEY  the API key (Resend → API Keys)
//   EMAIL_FROM      the sender, on a domain verified in Resend, e.g. "Aming <studio@aming.ug>"
// Without a key outside production, emails are printed in the server log
// instead, so codes can be tried locally.

import { AppError } from "@repo/lib/kernel/core";

import type { Mailer } from "../../ports";

export const resendMailer: Mailer = {
  async send({ to, subject, text }) {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) {
      if (process.env.NODE_ENV !== "production") {
        console.info(`[email to ${to}] ${subject}\n${text}`);
        return;
      }
      throw new AppError("Email isn't set up yet. Ask Aming to finish the email settings.");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok) {
      console.error("resend: send failed", response.status, await response.text());
      throw new AppError("The email couldn't be sent. Check the address and try again.");
    }
  },
};
