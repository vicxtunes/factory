// The emails studio access sends, in one place: edit the wording here. Each
// has a designed (HTML) version and a plain-text one for mail apps that don't
// show designs. Pure.

import { CODE_MINUTES } from "./rules";
import type { ReviewDecision } from "./model";

export const BRAND = "Aming Space";
const ORANGE = "#f67413";
const NAVY = "#1f2a4d";

export interface Email {
  subject: string;
  text: string;
  html: string;
}

/** Where the emails' links and logo point. */
export interface EmailLinks {
  /** The studio workspace. */
  workspace: string;
  /** The app icon at a public address, or null to show the name only. */
  logo: string | null;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#374151">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

const FOOTER = `This is an automatic email from ${BRAND}. Replies to it aren't read.`;

/** The frame every email shares: the brand, a white card, the footer. */
function layout(links: EmailLinks, body: string, button?: { label: string; href: string }): string {
  const logo = links.logo
    ? `<img src="${escape(links.logo)}" width="32" height="32" alt="" style="display:inline-block;vertical-align:middle;border-radius:8px;border:0">&nbsp;&nbsp;`
    : "";
  const cta = button
    ? `<p style="margin:24px 0 8px"><a href="${escape(button.href)}" style="display:inline-block;background:${ORANGE};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${escape(button.label)}</a></p>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BRAND}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:4px 4px 18px">${logo}<span style="vertical-align:middle;font-size:20px;font-weight:700;color:${NAVY}">Aming <span style="color:${ORANGE}">Space</span></span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px 24px">${body}${cta}</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:#9ca3af">${FOOTER}</td></tr>
</table></td></tr></table></body></html>`;
}

const heading = (text: string) => `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827">${escape(text)}</h1>`;

/** A 6-digit code: to verify the owner's email, or to reset the studio password. */
export function codeEmail(links: EmailLinks, studio: string, purpose: "verify" | "reset", code: string): Email {
  const what = purpose === "verify" ? "verify your email for" : "reset the password of";
  const title = purpose === "verify" ? "Verify your email" : "Reset your studio password";
  const after = `It works for ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email: nothing changes.`;
  return {
    subject: `${code} is your ${studio} code`,
    text: `${title}\n\nYour code to ${what} ${studio} on ${BRAND} is:\n\n${code}\n\n${after}\n\n${FOOTER}`,
    html: layout(
      links,
      heading(title) +
        paragraphs(`Your code to ${what} ${studio} on ${BRAND} is:`) +
        `<p style="margin:8px 0 20px;font-size:34px;font-weight:700;letter-spacing:10px;color:${NAVY};font-family:'SFMono-Regular',Menlo,Consolas,monospace">${escape(code)}</p>` +
        paragraphs(after),
    ),
  };
}

/** After a password reset: every other device was signed out. */
export function passwordChangedEmail(links: EmailLinks, studio: string): Email {
  const body = `The password for ${studio} was just changed, and every other device was signed out.\n\nIf this wasn't you, reset it again now and contact ${BRAND}.`;
  return {
    subject: `Your ${studio} password was changed`,
    text: `${body}\n\nOpen your studio: ${links.workspace}\n\n${FOOTER}`,
    html: layout(links, heading("Your studio password was changed") + paragraphs(body), { label: "Open your studio", href: links.workspace }),
  };
}

/** The boss's decision. `reason` is required for send back and suspend. */
export function reviewEmail(links: EmailLinks, studio: string, decision: ReviewDecision, reason: string | null): Email {
  const said = reason ? `\n\n${BRAND} says:\n${reason}` : "";
  const content = {
    approve: {
      subject: `${studio} is approved`,
      body: `Good news: your studio is open. Your public page is live and your clients can sign in.`,
      button: "Open your studio",
    },
    send_back: {
      subject: `${studio} needs a few changes`,
      body: `${BRAND} looked at your studio and asks for a few changes before it opens.${said}\n\nMake the changes, then submit again.`,
      button: "Make the changes",
    },
    suspend: {
      subject: `${studio} is suspended`,
      body: `Your studio is suspended: its workspace, public page and client sign-in are stopped.${said}\n\nTalk to ${BRAND} to reopen it.`,
      button: "Open your studio",
    },
  }[decision];
  return {
    subject: content.subject,
    text: `${content.body}\n\n${content.button}: ${links.workspace}\n\n${FOOTER}`,
    html: layout(links, heading(content.subject) + paragraphs(content.body), { label: content.button, href: links.workspace }),
  };
}
