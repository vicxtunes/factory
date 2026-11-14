import "server-only";

import { can, type Access, type Level, type Section } from "@repo/lib/staff-access/core";
import { z } from "zod";

import { removeStaff } from "@repo/lib/staff-access/actions";
import { changeTool, outcome, readTool, type ChangeTool } from "@repo/lib/assistant/panel/toolbox";
import type { AssistantTool } from "@repo/lib/assistant/server/tools";
import { addMediaLink, deleteOrderItemMedia } from "@repo/lib/storage/actions";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { createTopupBonus, listTopupBonuses, stopTopupBonus } from "@repo/lib/wallet/actions";

import {
  createCategory,
  createProduct,
  createStation,
  createVariant,
  deactivateDesigner,
  deactivateWorker,
  deleteStation,
  reactivateDesigner,
  reactivateWorker,
  renameCategory,
  renameProduct,
  renameStation,
  renameVariant,
  setCategoryActive,
  setCategoryInShowroom,
  setCurrencyActive,
  setProductActive,
  setProductDescription,
  setProductPrice,
  setProductUnit,
  setShowPrices,
  setVariantActive,
  setVariantPrice,
  updateWorker,
} from "./dashboard/actions";

// Orders' files, the catalog, the team and the other settings through Alexis
// (2026-11-10), on cards that run the pages' own server actions. PINs and
// passwords are never set through Alexis: they'd sit in the chat.

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const id = z.string().uuid();
const db = () => createAdminClient();
const KIND_TABLE = { category: "product_categories", product: "products", variant: "product_variants" } as const;

async function named(table: string, rowId: string, what: string): Promise<{ name: string; active?: boolean }> {
  const { data } = await db().from(table).select("*").eq("id", rowId).maybeSingle();
  if (!data) throw new Error(`That ${what} doesn't exist. Look it up again.`);
  return data as { name: string; active?: boolean };
}

/** Reception, supervisors, the boss: the files on orders, workers' stations. */
function managerTools(): { read: AssistantTool[]; change: ChangeTool[] } {
  const change: ChangeTool[] = [
    changeTool({
      name: "add_order_link",
      description: "Add a link (Google Drive, Dropbox, WeTransfer…) to an order item's files. Item id from find_orders.",
      inputSchema: z.object({ itemId: id, url: z.string().url().max(2000) }),
      card: async ({ itemId, url }) => {
        const { data } = await db().from("order_items").select("product, order:orders!inner (order_no)").eq("id", itemId).maybeSingle<{ product: string; order: { order_no: string } }>();
        if (!data) throw new Error("That item doesn't exist.");
        return { title: `Order ${data.order.order_no}: add a link to ${data.product}`, lines: [url] };
      },
      run: async ({ itemId, url }) => outcome(await addMediaLink(itemId, url), "The link is on the item."),
    }),
    changeTool({
      name: "remove_order_file",
      description: "Remove a file or link from an order item (id from order_files). Only the person who added it, or the boss, can. Only when they ask to remove it.",
      inputSchema: z.object({ fileId: id }),
      card: async ({ fileId }) => {
        const { data } = await db().from("order_item_media").select("file_name, uploaded_by_name, item:order_items!inner (product, order:orders!inner (order_no))").eq("id", fileId).maybeSingle<{ file_name: string; uploaded_by_name: string | null; item: { product: string; order: { order_no: string } } }>();
        if (!data) throw new Error("That file doesn't exist.");
        return { title: `Order ${data.item.order.order_no}: remove ${data.file_name}`, lines: [`From ${data.item.product}`, `Added by ${data.uploaded_by_name ?? "unknown"}`, "This can't be undone"] };
      },
      run: async ({ fileId }) => outcome(await deleteOrderItemMedia(fileId), "The file is removed."),
    }),
    changeTool({
      name: "set_worker_station",
      description: "Put a factory worker at a station (or none, with an empty station). Worker id from team.",
      inputSchema: z.object({ workerId: id, station: z.string().max(60) }),
      card: async ({ workerId, station }) => {
        const w = (await db().from("workers").select("name, station").eq("id", workerId).maybeSingle()).data;
        if (!w) throw new Error("That worker doesn't exist.");
        return { title: `${w.name}: ${station.trim() ? `station ${station.trim()}` : "no station"}`, lines: [`Now: ${w.station ?? "no station"}`] };
      },
      run: async ({ workerId, station }) => outcome(await updateWorker({ id: workerId, station }), "The station is set."),
    }),
  ];
  {
    change.push(
      changeTool({
        name: "set_worker_active",
        description: "Stop a factory worker signing in, or let them back. Worker id from team. Their PIN is changed on the Workers page only.",
        inputSchema: z.object({ workerId: id, active: z.boolean() }),
        card: async ({ workerId, active }) => {
          const w = await named("workers", workerId, "worker");
          if (w.active === active) throw new Error(`${w.name} is already ${active ? "active" : "stopped"}.`);
          return { title: `${active ? "Let" : "Stop"} ${w.name}${active ? " back" : ""}`, lines: [] };
        },
        run: async ({ workerId, active }) => outcome(await (active ? reactivateWorker(workerId) : deactivateWorker(workerId)), active ? "They can sign in again." : "They can't sign in now."),
      }),
    );
  }
  return {
    read: [
      readTool({
        name: "order_files",
        description: "The files and links on an order's items: id, name or link, which item, who added it and when.",
        inputSchema: z.object({ orderId: id }),
        run: async ({ orderId }) =>
          (await db().from("order_item_media").select("id, file_name, secure_url, storage_path, uploaded_by_name, uploaded_at, item:order_items!inner (id, product, order_id)").eq("item.order_id", orderId).order("uploaded_at").limit(300)).data,
      }),
    ],
    change,
  };
}

/** The boss: the catalog, stations, designers, staff accounts, currencies, the top-up bonus. */
function bossTools(): { read: AssistantTool[]; change: ChangeTool[] } {
  const kind = z.enum(["category", "product", "variant"]);
  return {
    read: [
      readTool({
        name: "catalog",
        description: "The product catalog: categories (on or off, shown in the showroom), their products (price in UGX, unit, description, on or off, priced from a recipe) and variants (price, on or off), with ids. Also whether clients see prices, and the stations.",
        inputSchema: z.object({}),
        run: async () => {
          const [categories, settings, stations] = await Promise.all([
            db().from("product_categories").select("id, name, active, in_showroom, products (id, name, price, unit, description, active, auto_price, variants:product_variants (id, name, price, active))").order("name"),
            db().from("showroom_settings").select("show_prices").eq("id", 1).maybeSingle(),
            db().from("stations").select("id, name").order("name"),
          ]);
          return { showPrices: settings.data?.show_prices ?? null, categories: categories.data, stations: stations.data };
        },
      }),
      readTool({
        name: "topup_bonuses",
        description: "The top-up bonuses (extra on the Aming card when clients top up): id, percent, minimum top-up in UGX, start, end, running, planned or ended.",
        inputSchema: z.object({}),
        run: async () => {
          const res = await listTopupBonuses();
          return res.ok ? res.data : res.error;
        },
      }),
    ],
    change: [
      changeTool({
        name: "catalog_add",
        description: "Add a category, a product (in a category: parentId is the category id) or a variant (of a product: parentId is the product id). Prices are set after, with set_price.",
        inputSchema: z.object({ kind, parentId: id.nullable(), name: z.string().trim().min(1).max(100) }),
        card: async ({ kind: k, parentId, name }) => {
          if (k === "category") return { title: `New category: ${name}`, lines: [] };
          if (!parentId) throw new Error(`Say which ${k === "product" ? "category" : "product"} it goes in.`);
          const parent = await named(k === "product" ? "product_categories" : "products", parentId, k === "product" ? "category" : "product");
          return { title: `New ${k} in ${parent.name}: ${name}`, lines: [] };
        },
        run: async ({ kind: k, parentId, name }) =>
          outcome(await (k === "category" ? createCategory(name) : k === "product" ? createProduct(parentId ?? "", name) : createVariant(parentId ?? "", name)), `${name} is added.`),
      }),
      changeTool({
        name: "catalog_rename",
        description: "Rename a category, product or variant (ids from catalog).",
        inputSchema: z.object({ kind, id, name: z.string().trim().min(1).max(100) }),
        card: async ({ kind: k, id: rowId, name }) => ({ title: `Rename ${k} ${(await named(KIND_TABLE[k], rowId, k)).name} to ${name}`, lines: [] }),
        run: async ({ kind: k, id: rowId, name }) => outcome(await (k === "category" ? renameCategory(rowId, name) : k === "product" ? renameProduct(rowId, name) : renameVariant(rowId, name)), `It's ${name} now.`),
      }),
      changeTool({
        name: "catalog_on_off",
        description: "Turn a category, product or variant off (clients and staff can't order it) or on again.",
        inputSchema: z.object({ kind, id, on: z.boolean() }),
        card: async ({ kind: k, id: rowId, on }) => {
          const row = await named(KIND_TABLE[k], rowId, k);
          if (row.active === on) throw new Error(`${row.name} is already ${on ? "on" : "off"}.`);
          return { title: `Turn ${k} ${row.name} ${on ? "on" : "off"}`, lines: on ? [] : ["It can't be ordered while it's off"] };
        },
        run: async ({ kind: k, id: rowId, on }) => outcome(await (k === "category" ? setCategoryActive(rowId, on) : k === "product" ? setProductActive(rowId, on) : setVariantActive(rowId, on)), on ? "It's on." : "It's off."),
      }),
      changeTool({
        name: "category_in_showroom",
        description: "Show a category in the client showroom, or hide it there.",
        inputSchema: z.object({ categoryId: id, shown: z.boolean() }),
        card: async ({ categoryId, shown }) => ({ title: `${shown ? "Show" : "Hide"} ${(await named("product_categories", categoryId, "category")).name} in the showroom`, lines: [] }),
        run: async ({ categoryId, shown }) => outcome(await setCategoryInShowroom(categoryId, shown), shown ? "It's in the showroom." : "It's hidden from the showroom."),
      }),
      changeTool({
        name: "set_price",
        description: "A product's or variant's catalog price in UGX, or null for no price (priced on the call). Photo books priced from their recipe can't take a price here.",
        inputSchema: z.object({ kind: z.enum(["product", "variant"]), id, price: z.number().int().min(0).nullable() }),
        card: async ({ kind: k, id: rowId, price }) => {
          const { data } = await db().from(KIND_TABLE[k]).select("name, price").eq("id", rowId).maybeSingle();
          if (!data) throw new Error(`That ${k} doesn't exist.`);
          return { title: `${data.name}: ${price == null ? "no price" : ugx(price)}`, lines: [`Now: ${data.price == null ? "no price" : ugx(Number(data.price))}`] };
        },
        run: async ({ kind: k, id: rowId, price }) => outcome(await (k === "product" ? setProductPrice(rowId, price == null ? "" : String(price)) : setVariantPrice(rowId, price == null ? "" : String(price))), "The price is set."),
      }),
      changeTool({
        name: "edit_product",
        description: "A product's unit (e.g. sheet, copy, piece) or description for clients. Give what changes.",
        inputSchema: z.object({ productId: id, unit: z.string().max(30).nullable(), description: z.string().max(2000).nullable() }),
        card: async ({ productId, unit, description }) => {
          if (unit == null && description == null) throw new Error("Nothing changes: give a unit or a description.");
          const p = await named("products", productId, "product");
          return { title: `Edit ${p.name}`, lines: [...(unit != null ? [`Unit: ${unit || "none"}`] : []), ...(description != null ? [`Description: ${description.slice(0, 200)}`] : [])] };
        },
        run: async ({ productId, unit, description }) => {
          if (unit != null) {
            const res = await setProductUnit(productId, unit);
            if (!res.ok) return res;
          }
          return description != null ? outcome(await setProductDescription(productId, description), "The product is updated.") : { ok: true, done: "The product is updated." };
        },
      }),
      changeTool({
        name: "show_prices",
        description: "Whether clients see prices in the showroom.",
        inputSchema: z.object({ show: z.boolean() }),
        card: async ({ show }) => ({ title: show ? "Show prices to clients" : "Hide prices from clients", lines: [] }),
        run: async ({ show }) => outcome(await setShowPrices(show), show ? "Clients see prices." : "Prices are hidden."),
      }),
      changeTool({
        name: "station",
        description: "Add a factory station (id null), rename one, or delete one (delete true). Ids from catalog's stations.",
        inputSchema: z.object({ id: id.nullable(), name: z.string().trim().max(60).nullable(), delete: z.boolean() }),
        card: async ({ id: rowId, name, delete: del }) => {
          if (!rowId) {
            if (!name) throw new Error("Give the new station a name.");
            return { title: `New station: ${name}`, lines: [] };
          }
          const s = await named("stations", rowId, "station");
          if (del) return { title: `Delete station ${s.name}`, lines: ["This can't be undone"] };
          if (!name) throw new Error("Give the new name.");
          return { title: `Rename station ${s.name} to ${name}`, lines: [] };
        },
        run: async ({ id: rowId, name, delete: del }) =>
          outcome(await (!rowId ? createStation(name ?? "") : del ? deleteStation(rowId) : renameStation(rowId, name ?? "")), !rowId ? "The station is added." : del ? "The station is deleted." : "The station is renamed."),
      }),
      changeTool({
        name: "set_designer_active",
        description: "Stop a graphics designer signing in, or let them back. Designer id from team. Their PIN is changed on the Designers page only.",
        inputSchema: z.object({ designerId: id, active: z.boolean() }),
        card: async ({ designerId, active }) => {
          const d = await named("designers", designerId, "designer");
          if (d.active === active) throw new Error(`${d.name} is already ${active ? "active" : "stopped"}.`);
          return { title: `${active ? "Let" : "Stop"} ${d.name}${active ? " back" : ""}`, lines: [] };
        },
        run: async ({ designerId, active }) => outcome(await (active ? reactivateDesigner(designerId) : deactivateDesigner(designerId)), active ? "They can sign in again." : "They can't sign in now."),
      }),
      changeTool({
        name: "remove_staff_account",
        description: "Remove someone's dashboard sign-in for good (id from staff_accounts). Not your own. Only when asked to remove them.",
        inputSchema: z.object({ userId: id }),
        card: async ({ userId }) => {
          const { data } = await db().from("profiles").select("full_name, role").eq("id", userId).maybeSingle();
          if (!data) throw new Error("That person doesn't exist.");
          return { title: `Remove ${data.full_name ?? "this person"}'s sign-in`, lines: [`Role: ${data.role}`, "This can't be undone"] };
        },
        run: async ({ userId }) => outcome(await removeStaff(userId), "Their sign-in is removed."),
      }),
      changeTool({
        name: "set_currency_on",
        description: "Let clients see prices in a currency, or stop it (codes from currencies).",
        inputSchema: z.object({ code: z.string().length(3), on: z.boolean() }),
        card: async ({ code, on }) => {
          const { data } = await db().from("currencies").select("label, active, is_base").eq("code", code.toUpperCase()).maybeSingle();
          if (!data) throw new Error(`There's no ${code} currency.`);
          if (data.is_base) throw new Error("UGX is always on.");
          if (data.active === on) throw new Error(`${data.label} is already ${on ? "on" : "off"}.`);
          return { title: `${on ? "Turn on" : "Turn off"} ${data.label}`, lines: [] };
        },
        run: async ({ code, on }) => {
          const { data } = await db().from("currencies").select("id").eq("code", code.toUpperCase()).maybeSingle();
          return data ? outcome(await setCurrencyActive(data.id as string, on), on ? "Clients can use it." : "It's off.") : { ok: false, error: "That currency is gone." };
        },
      }),
      changeTool({
        name: "topup_bonus",
        description: "Start or plan a top-up bonus: percent extra on top-ups of at least minAmount UGX, from startsAt (null: now) to endsAt (null: until stopped). ISO date-times.",
        inputSchema: z.object({ percent: z.number().int().min(1).max(100), minAmount: z.number().int().min(0), startsAt: z.string().nullable(), endsAt: z.string().nullable() }),
        card: async (b) => ({ title: `Top-up bonus: ${b.percent}% extra`, lines: [`On top-ups of ${ugx(b.minAmount)} or more`, `From ${b.startsAt ?? "now"} until ${b.endsAt ?? "stopped"}`] }),
        run: async (b) => outcome(await createTopupBonus(b), "The bonus is set."),
      }),
      changeTool({
        name: "stop_topup_bonus",
        description: "End the running top-up bonus now, or cancel a planned one (id from topup_bonuses).",
        inputSchema: z.object({ bonusId: id }),
        card: async ({ bonusId }) => {
          const res = await listTopupBonuses();
          const b = res.ok ? res.data.find((x) => x.id === bonusId) : null;
          if (!b) throw new Error("That bonus doesn't exist.");
          if (b.status === "ended") throw new Error("That bonus has already ended.");
          return { title: `${b.status === "running" ? "End" : "Cancel"} the ${b.percent}% top-up bonus`, lines: [`On top-ups of ${ugx(b.minAmount)} or more`] };
        },
        run: async ({ bonusId }) => outcome(await stopTopupBonus(bonusId), "The bonus is stopped."),
      }),
    ],
  };
}

/** Which staff access each tool needs (packages/lib/staff-access); "boss": Team & access. */
const NEEDS: Record<string, [Section, Exclude<Level, "none">] | "boss"> = {
  order_files: ["orders", "view"],
  add_order_link: ["orders", "manage"],
  remove_order_file: ["orders", "manage"],
  set_worker_station: ["workers", "manage"],
  set_worker_active: ["worker_logins", "manage"],
  catalog: ["catalog", "view"],
  topup_bonuses: ["discounts", "view"],
  catalog_add: ["catalog", "manage"],
  catalog_rename: ["catalog", "manage"],
  catalog_on_off: ["catalog", "manage"],
  category_in_showroom: ["catalog", "manage"],
  set_price: ["catalog", "manage"],
  edit_product: ["catalog", "manage"],
  show_prices: ["catalog", "manage"],
  set_currency_on: ["catalog", "manage"],
  station: ["stations", "manage"],
  set_designer_active: ["designers", "manage"],
  remove_staff_account: "boss",
  topup_bonus: ["discounts", "manage"],
  stop_topup_bonus: ["discounts", "manage"],
};

/** Order files, workers, the catalog, stations, designers, bonuses: each tool for whoever its section reaches. */
export function settingsTools(v: { isBoss: boolean; access: Access }): { read: AssistantTool[]; change: ChangeTool[] } {
  const m = managerTools();
  const b = bossTools();
  const allowed = (t: { name: string }) => {
    const need = NEEDS[t.name];
    if (!need) return false;
    return need === "boss" ? v.isBoss : can(v.access, need[0], need[1]);
  };
  return { read: [...m.read, ...b.read].filter(allowed), change: [...m.change, ...b.change].filter(allowed) };
}
