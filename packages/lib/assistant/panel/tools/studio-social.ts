import "server-only";

import { z } from "zod";

import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import { savePost } from "@repo/lib/social/actions";
import { platformName, problemFor } from "@repo/lib/social/core";
import { accountsOf, profileOf } from "@repo/lib/social/server";
import { zernioReady } from "@repo/lib/social/zernio";

import { changeTool, outcome, readTool, type ChangeTool } from "../toolbox";
import type { AssistantTool } from "../../server/tools";

// Social posts through Alexis (packages/lib/social): see the business's
// connected pages, and post or schedule a text post to them on a confirm
// card. Photos and videos are added on Social posts itself.

const kampala = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** For a business with Pro, to someone who manages its catalog. */
export async function studioSocialTools(studio: { id: string; name: string }): Promise<{ read: AssistantTool[]; change: ChangeTool[]; words: string } | null> {
  if (!zernioReady() || !isPro(await proStatus(studio.id))) return null;
  const pages = async () => accountsOf(await profileOf(studio.id, studio.name));
  return {
    read: [
      readTool({
        name: "studio_social_pages",
        description: "The business's social pages connected on Social posts (id, platform, name, broken = needs reconnecting). Post to them with schedule_social_post.",
        inputSchema: z.object({}),
        run: async () => (await pages()).map((p) => ({ id: p.id, platform: platformName(p.platform), name: p.name, broken: p.broken })),
      }),
    ],
    change: [
      changeTool({
        name: "schedule_social_post",
        description:
          "Post a caption to some of the business's connected social pages (ids from studio_social_pages), now (at null) or at a time (ISO with +03:00, Kampala). Text only: Instagram, TikTok, YouTube and Pinterest need a photo or video, added on My Business → Social posts. Write the caption yourself if asked; keep the person's facts.",
        inputSchema: z.object({ caption: z.string().trim().min(1).max(5000), accountIds: z.array(z.string().min(1)).min(1), at: z.string().datetime({ offset: true }).nullable() }),
        card: async ({ caption, accountIds, at }) => {
          const all = await pages();
          const chosen = accountIds.map((id) => all.find((p) => p.id === id));
          if (chosen.some((p) => !p)) throw new Error("One of those pages isn't connected. Look again with studio_social_pages.");
          const problems = chosen.map((p) => problemFor(p!.platform, caption, [])).filter((x): x is string => !!x);
          if (problems.length) throw new Error(problems.join(" "));
          return { title: at ? `Schedule a post for ${kampala(at)}` : "Post now", lines: [`To: ${chosen.map((p) => `${p!.name} (${platformName(p!.platform)})`).join(", ")}`, caption] };
        },
        run: async ({ caption, accountIds, at }) => outcome(await savePost(null, { caption, media: [], accountIds, scheduledAt: at }), at ? "The post is scheduled." : "The post is going out."),
      }),
    ],
    words: "see its social pages and post or schedule to them",
  };
}
