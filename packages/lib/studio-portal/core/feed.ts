// The feed on Aming's front page: the work of businesses that opted in to
// show it (tenants.show_on_aming). Each tile is a public album or a service
// with photos, and opens that business's page for it. Pure.

import type { BusinessKind } from "@repo/lib/studios/core";

export interface FeedItem {
  /** The album's id: unique across the feed. */
  id: string;
  kind: "album" | "service";
  title: string;
  /** Its page under the business's: /<studio>/gallery/<album> or /<studio>/s/<service>. */
  href: string;
  coverUrl: string;
  photoCount: number;
  business: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColor: string | null;
    kind: BusinessKind;
    vendorCategory: string | null;
  };
}

/**
 * Takes turns between businesses, each one's own order kept, so the top of
 * the feed shows many businesses rather than one business's every album.
 */
export function mixFeed(items: FeedItem[]): FeedItem[] {
  const queues = new Map<string, FeedItem[]>();
  for (const item of items) queues.set(item.business.id, [...(queues.get(item.business.id) ?? []), item]);
  const mixed: FeedItem[] = [];
  for (let round = 0; mixed.length < items.length; round++) {
    for (const queue of queues.values()) if (queue[round]) mixed.push(queue[round]);
  }
  return mixed;
}
