// What a studio's customer is emailed as their project moves on: they have no
// app to be notified in, only the studio's page. Pure.

import { escape, heading, layout, paragraphs, type Email, type EmailLinks } from "@repo/lib/studio-access/core/emails";

import type { ProjectStatus } from "./model";

/** Started (in progress) or finished (done): the moves a customer hears about. */
export function projectStageEmail(
  links: EmailLinks,
  p: { studio: string; customer: string; title: string; to: Extract<ProjectStatus, "in_progress" | "done">; pageUrl: string | null },
): Email {
  const first = p.customer.split(/\s+/)[0] || p.customer;
  const subject = p.to === "in_progress" ? "Your project is now being worked on" : "Your project is done";
  const says =
    p.to === "in_progress"
      ? `Hello ${first},\n\n${p.studio} has started work on "${p.title}". We'll let you know when it's done.`
      : `Hello ${first},\n\n${p.studio} has finished "${p.title}". Your photos and files are ready on their page.`;
  const button = p.pageUrl ? { label: p.to === "in_progress" ? "Follow your project" : "See your project", href: p.pageUrl } : undefined;
  return {
    subject,
    text: `${says}${p.pageUrl ? `\n\n${p.pageUrl}` : ""}\n\n${p.studio}, on Aming Space`,
    html: layout(links, `${heading(subject)}${paragraphs(says)}<p style="margin:0;font-size:13px;color:#6b7280">${escape(p.studio)}, on Aming Space</p>`, button),
  };
}
