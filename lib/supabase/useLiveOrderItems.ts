"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import type { OrderItem, OrderItemWithOrder } from "@/lib/types";

import { createClient } from "./browser";

// Keeps a live board's order items in sync with Realtime without
// re-downloading the whole board on every change:
// - an item update that only touches the fields below is applied in place
//   from the event itself (no request);
// - anything else (new item, order changed, other fields) re-loads just the
//   affected orders, batched: one user action fires several events, so they
//   are collected for a moment and loaded together;
// - a deleted item is removed.
// While the tab is hidden, affected orders are queued and loaded once it's
// visible again; after a long time hidden (phones drop the socket) the whole
// board is reloaded instead. Loads never overlap, so an older response
// can't overwrite a newer one.

/** Item fields a Realtime update can carry straight onto the board. */
const PATCHABLE = [
  "production_status",
  "is_delayed",
  "delay_reason",
  "assigned_worker_id",
  "updated_by_worker_id",
  "updated_at",
  "urgency",
  "media_link",
] as const satisfies readonly (keyof OrderItem)[];

const BATCH_MS = 1000;
const RELOAD_AFTER_HIDDEN_MS = 60_000;

/**
 * The board's own query: all of its items, or only those of `orderIds`.
 * Returns null on error (the board keeps what it has).
 */
export type LoadItems = (orderIds?: string[]) => Promise<OrderItemWithOrder[] | null>;

export interface LiveOrderItemsOptions {
  /** Realtime filter for the `orders` table, e.g. `client_id=eq.<id>`. */
  ordersFilter?: string;
  /**
   * Ignore item events for orders this board hasn't seen. For boards that
   * only show a few orders (one client's), so other orders' changes cost
   * nothing; new orders still arrive through the filtered `orders` events.
   */
  ignoreUnknownOrders?: boolean;
}

type Row = Record<string, unknown>;

const byNewest = (a: OrderItemWithOrder, b: OrderItemWithOrder) => b.created_at.localeCompare(a.created_at);

export function useLiveOrderItems(
  channelName: string,
  items: OrderItemWithOrder[],
  setItems: Dispatch<SetStateAction<OrderItemWithOrder[]>>,
  load: LoadItems,
  { ordersFilter, ignoreUnknownOrders = false }: LiveOrderItemsOptions = {},
): void {
  const itemsRef = useRef(items);
  const loadRef = useRef(load);
  useEffect(() => {
    itemsRef.current = items;
    loadRef.current = load;
  }, [items, load]);

  useEffect(() => {
    const queued = new Set<string>(); // order ids to re-load
    const seenOrders = new Set<string>(); // orders announced by `orders` events
    let reloadAll = false;
    let timer: number | undefined;
    let running = false;
    let hiddenAt = 0;

    const knownOrder = (orderId: string) =>
      seenOrders.has(orderId) || itemsRef.current.some((i) => i.order_id === orderId);

    async function flush() {
      if (running || (!reloadAll && queued.size === 0)) return;
      running = true;
      const all = reloadAll;
      const orderIds = [...queued];
      reloadAll = false;
      queued.clear();
      try {
        const fresh = await loadRef.current(all ? undefined : orderIds);
        if (fresh) {
          if (all) {
            setItems(fresh);
          } else {
            const ids = new Set(orderIds);
            setItems((prev) => [...prev.filter((i) => !ids.has(i.order_id)), ...fresh].sort(byNewest));
          }
        }
      } finally {
        running = false;
        if (reloadAll || queued.size > 0) schedule();
      }
    }

    function schedule() {
      if (document.visibilityState === "hidden") return; // flushed on return
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, BATCH_MS);
    }

    function queueOrder(orderId: string | undefined) {
      if (!orderId) return;
      queued.add(orderId);
      schedule();
    }

    function onItemChange(eventType: string, row: Row, old: Row) {
      if (eventType === "DELETE") {
        const id = old.id as string | undefined;
        if (id) setItems((prev) => prev.filter((i) => i.id !== id));
        return;
      }
      const orderId = row.order_id as string;
      const existing = itemsRef.current.find((i) => i.id === row.id);
      if (!existing) {
        if (!ignoreUnknownOrders || knownOrder(orderId)) queueOrder(orderId);
        return;
      }
      // Only fields the board shows as-is can be patched; anything else
      // (stage, qty, product, price…) may change which board the item
      // belongs on or a joined value, so its order is re-loaded instead.
      const patchable = new Set<string>(PATCHABLE);
      const needsLoad = Object.keys(row).some(
        (key) => !patchable.has(key) && key in existing && JSON.stringify(row[key]) !== JSON.stringify(existing[key as keyof OrderItem]),
      );
      if (needsLoad) {
        queueOrder(orderId);
        return;
      }
      const patch = Object.fromEntries(PATCHABLE.filter((k) => k in row).map((k) => [k, row[k]]));
      setItems((prev) => prev.map((i) => (i.id === existing.id ? { ...i, ...patch } : i)));
    }

    function onOrderChange(eventType: string, row: Row, old: Row) {
      const orderId = (row.id ?? old.id) as string | undefined;
      if (!orderId) return;
      if (eventType === "DELETE") {
        setItems((prev) => prev.filter((i) => i.order_id !== orderId));
        return;
      }
      seenOrders.add(orderId);
      queueOrder(orderId);
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > RELOAD_AFTER_HIDDEN_MS) reloadAll = true;
      hiddenAt = 0;
      flush();
    }

    const supabase = createClient();
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (p) =>
        onItemChange(p.eventType, p.new as Row, p.old as Row),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", ...(ordersFilter ? { filter: ordersFilter } : {}) },
        (p) => onOrderChange(p.eventType, p.new as Row, p.old as Row),
      )
      .subscribe();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [channelName, setItems, ordersFilter, ignoreUnknownOrders]);
}
