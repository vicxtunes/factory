import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar } from "@repo/ui/Avatar";
import { OrdersIcon, PlaceOrderIcon, ShowroomIcon } from "@repo/ui/icons";
import { StatusPieChart } from "@repo/ui/charts/OrderCharts";
import { CLIENT_STATUS_LABELS, clientStatus, clientStatusSteps } from "@repo/lib/orders/clientStatus";
import { BOARD_COLUMNS, STATUS_LABELS, type MarketingSlide, type OrderItemWithOrder, type Product } from "@repo/lib/types";

import { HomeSlider } from "./home-slider";
import { MarketingCarousel } from "./marketing-carousel";

// The client's home, laid out like an LMS dashboard (design/ in the repo
// root). From lg up: a first row of three (the wallet, who's signed in with
// their shortcuts, the adverts), then the orders being made (with how far
// along each is) and Aming's products, beside a rail with the counts and the
// items by status. Phones and tablets read it in one column: the wallet and
// the adverts in one slider, the orders, the products, the counts, the chart.

const TILE = "rounded-3xl border border-border bg-surface p-5 shadow-theme-xs";

/** How many orders in progress and products the home shows. */
const IN_PROGRESS_SHOWN = 4;
const PRODUCTS_SHOWN = 6;

function SectionHead({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Link href={href} className="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
        {link}
      </Link>
    </div>
  );
}

/** An item being made: what it is, which order, and how far along. */
function InProgressCard({ item }: { item: OrderItemWithOrder }) {
  const steps = clientStatusSteps(item.stage);
  const now = clientStatus(item);
  const step = steps.indexOf(now) + 1;
  return (
    <Link href="/orders" className={`${TILE} block transition-colors hover:border-brand-300 dark:hover:border-brand-500/40`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5 12 3 3.75 7.5m16.5 0-8.25 4.5m8.25-4.5v9L12 21m0-9L3.75 7.5m8.25 4.5v9m0-9L3.75 16.5m0-9v9L12 21" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.product}</p>
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">
            Order {item.order.order_no}
            {item.qty > 1 ? ` · ${item.qty} pcs` : ""}
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div className={`h-full rounded-full ${item.is_delayed ? "bg-[var(--rush)]" : "bg-brand-500"}`} style={{ width: `${(step / steps.length) * 100}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
        <span className={item.is_delayed ? "font-medium text-[var(--rush)]" : ""}>
          {CLIENT_STATUS_LABELS[now]}
          {item.is_delayed ? " · delayed" : ""}
        </span>
        <span className="shrink-0 tabular-nums">
          Step {step} of {steps.length}
        </span>
      </div>
      <p className="mt-4 text-sm font-medium text-brand-600 dark:text-brand-400">Track order →</p>
    </Link>
  );
}

/** One of Aming's products: its picture and name, opening its own page. Prices are held back (see packages/lib/types.ts → Product.price). */
function ProductCard({ product, category }: { product: Product; category: string }) {
  return (
    <Link href={`/${encodeURIComponent(product.slug)}`} className="group block overflow-hidden rounded-3xl border border-border bg-surface shadow-theme-xs">
      <div className="aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-white/5">
        {product.display_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.display_image_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : null}
      </div>
      <div className="p-4">
        <p className="truncate font-semibold">{product.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{category}</p>
      </div>
    </Link>
  );
}

/** The three things a client most often comes to do; "Add order" is the main one. */
const ACTIONS = [
  { href: "/new", label: "Add order", icon: PlaceOrderIcon, primary: true },
  { href: "/showroom", label: "Showroom", icon: ShowroomIcon, primary: false },
  { href: "/orders", label: "Track orders", icon: OrdersIcon, primary: false },
] as const;

/** Who's signed in, and the shortcuts under them. */
function Person({ client }: { client: { name: string; avatarUrl: string | null } }) {
  return (
    <section aria-label="You" className={`${TILE} flex h-full flex-col`}>
      <div className="flex items-center gap-3">
        <Avatar name={client.name} src={client.avatarUrl ?? undefined} size="lg" className="ring-2 ring-brand-500 ring-offset-2 ring-offset-surface" />
        <div className="min-w-0">
          <p className="truncate font-semibold">Hello, {client.name.split(" ")[0]}</p>
          <p className="truncate text-xs text-muted">Welcome back to Aming Space</p>
        </div>
      </div>
      <nav aria-label="Quick actions" className="mt-auto grid grid-cols-3 gap-2 pt-5">
        {ACTIONS.map(({ href, label, icon: Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 py-2 text-center transition-colors ${
              primary ? "border-brand-500 bg-brand-500 text-white hover:bg-brand-600" : "border-border hover:bg-background"
            }`}
          >
            <Icon className={`h-5 w-5 ${primary ? "" : "text-brand-600 dark:text-brand-400"}`} />
            <span className="text-xs font-semibold">{label}</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}

export function ClientDashboard({
  client,
  items,
  slides,
  products,
  wallet,
}: {
  client: { name: string; avatarUrl: string | null };
  items: OrderItemWithOrder[];
  slides: MarketingSlide[];
  /** Aming's products to show, each with its category's name. */
  products: { product: Product; category: string }[];
  /** The wallet tile; null when the wallet can't load. */
  wallet: ReactNode;
}) {
  const completed = items.filter((i) => i.production_status === "completed").length;
  const making = items.filter((i) => i.production_status !== "completed");
  const inProgress = making.slice(0, IN_PROGRESS_SHOWN);
  const statusData = [...BOARD_COLUMNS, "completed" as const].map((status) => ({
    label: STATUS_LABELS[status],
    count: items.filter((i) => i.production_status === status).length,
  }));

  return (
    <div className="space-y-6">
      {/* Phones and tablets: the wallet first, then the adverts, in one slider. */}
      <div className="lg:hidden">
        <HomeSlider wallet={wallet} slides={slides} />
      </div>
      {/* lg up: three across, the same height. The adverts keep their own shape, centered in theirs. */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
        {wallet ? <div className="min-w-0">{wallet}</div> : null}
        <div className="min-w-0">
          <Person client={client} />
        </div>
        {slides.length ? (
          <div className="flex min-w-0 flex-col justify-center">
            <MarketingCarousel slides={slides} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section>
            <SectionHead title="Being made for you" href="/orders" link="All orders" />
            {inProgress.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {inProgress.map((item) => (
                  <InProgressCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
                <p className="text-sm text-muted">Nothing being made right now.</p>
                <Link href="/new" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600">
                  Add order
                </Link>
              </div>
            )}
          </section>

          {products.length ? (
            <section>
              <SectionHead title="From Aming" href="/showroom" link="Showroom" />
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {products.slice(0, PRODUCTS_SHOWN).map(({ product, category }) => (
                  <ProductCard key={product.id} product={product} category={category} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className={TILE}>
              <p className="text-2xl font-bold tabular-nums">{making.length}</p>
              <p className="mt-1 text-xs text-muted">Being made</p>
            </div>
            <div className={TILE}>
              <p className="text-2xl font-bold tabular-nums">{completed}</p>
              <p className="mt-1 text-xs text-muted">Completed</p>
            </div>
          </div>
          {items.length ? (
            <section className={TILE}>
              <h2 className="mb-2 text-base font-semibold">Items by status</h2>
              <StatusPieChart data={statusData} />
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
