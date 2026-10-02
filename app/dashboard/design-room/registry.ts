import type { ComponentType } from "react";

import ButtonStates from "./examples/button/states";
import ButtonVariants from "./examples/button/variants";
import CurrencySelectBasic from "./examples/currency-select/basic";
import DateRangeCalendarBasic from "./examples/date-range-calendar/basic";
import DrawerBasic from "./examples/drawer/basic";
import FieldInputs from "./examples/field/inputs";
import InfoTipBasic from "./examples/info-tip/basic";
import PasswordInputBasic from "./examples/password-input/basic";
import PopoverBasic from "./examples/popover/basic";
import SectionLabelBasic from "./examples/section-label/basic";
import SkeletonListRow from "./examples/skeleton/list-row";
import SpinnerSizes from "./examples/spinner/sizes";
import StatusGlowBadgeAll from "./examples/status-glow-badge/all";
import TabsCounts from "./examples/tabs/counts";
import TicketCardCollection from "./examples/ticket-card/collection";
import UrgencyBadgeAll from "./examples/urgency-badge/all";

// Everything the Design Room shows. To add a component: build it in
// components/ui/, write its examples under ./examples/<slug>/ (one default
// export per file — the file's source is what the Code tab shows), then add
// an entry here. Flip status to "live" once a real page uses it.

export const CATEGORIES = ["Actions", "Inputs", "Navigation", "Overlays", "Feedback", "Data display"] as const;

export type RoomStatus = "live" | "draft";

export interface RoomComponent {
  slug: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  status: RoomStatus;
  /** Where the component itself lives. */
  source: string;
  summary: string;
  /** `file` is relative to ./examples/. The first one is the index-card preview. */
  examples: { title: string; file: string; Demo: ComponentType }[];
}

export const COMPONENTS: RoomComponent[] = [
  {
    slug: "button",
    name: "Button",
    category: "Actions",
    status: "live",
    source: "components/ui/Button.tsx",
    summary: "Primary actions in brand orange; intake (gold) is reserved for the order-submit action.",
    examples: [
      { title: "Variants", file: "button/variants.tsx", Demo: ButtonVariants },
      { title: "Loading & disabled", file: "button/states.tsx", Demo: ButtonStates },
    ],
  },
  {
    slug: "field",
    name: "Field",
    category: "Inputs",
    status: "live",
    source: "components/ui/Field.tsx",
    summary: "Label + hint wrapper with the shared TextInput, TextArea and Select styling.",
    examples: [{ title: "Text, number, select, textarea", file: "field/inputs.tsx", Demo: FieldInputs }],
  },
  {
    slug: "password-input",
    name: "Password input",
    category: "Inputs",
    status: "live",
    source: "components/ui/PasswordInput.tsx",
    summary: "Masked password/PIN field with a reveal toggle.",
    examples: [{ title: "PIN", file: "password-input/basic.tsx", Demo: PasswordInputBasic }],
  },
  {
    slug: "currency-select",
    name: "Currency select",
    category: "Inputs",
    status: "live",
    source: "components/ui/CurrencySelect.tsx",
    summary: "Compact currency picker; renders nothing when only the base currency exists.",
    examples: [{ title: "Two currencies", file: "currency-select/basic.tsx", Demo: CurrencySelectBasic }],
  },
  {
    slug: "date-range-calendar",
    name: "Date range calendar",
    category: "Inputs",
    status: "live",
    source: "components/ui/DateRangeCalendar.tsx",
    summary: "Desktop range picker — click a start day, then an end day.",
    examples: [{ title: "Range", file: "date-range-calendar/basic.tsx", Demo: DateRangeCalendarBasic }],
  },
  {
    slug: "tabs",
    name: "Tabs",
    category: "Navigation",
    status: "live",
    source: "components/ui/Tabs.tsx",
    summary: "Underlined category tabs with optional count badges; amber tone for counts that need attention.",
    examples: [{ title: "With counts", file: "tabs/counts.tsx", Demo: TabsCounts }],
  },
  {
    slug: "drawer",
    name: "Drawer",
    category: "Overlays",
    status: "live",
    source: "components/ui/Drawer.tsx",
    summary: "Right-hand sheet for detail panels and forms, with a pinned footer.",
    examples: [{ title: "With footer", file: "drawer/basic.tsx", Demo: DrawerBasic }],
  },
  {
    slug: "popover",
    name: "Popover",
    category: "Overlays",
    status: "live",
    source: "components/ui/Popover.tsx",
    summary: "Click-to-open panel anchored to a trigger — lighter than a drawer.",
    examples: [{ title: "Filters", file: "popover/basic.tsx", Demo: PopoverBasic }],
  },
  {
    slug: "info-tip",
    name: "Info tip",
    category: "Overlays",
    status: "live",
    source: "components/ui/InfoTip.tsx",
    summary: "ⓘ button with a tooltip bubble on hover or tap.",
    examples: [{ title: "Product note", file: "info-tip/basic.tsx", Demo: InfoTipBasic }],
  },
  {
    slug: "spinner",
    name: "Spinner",
    category: "Feedback",
    status: "live",
    source: "components/ui/Spinner.tsx",
    summary: "Inline spinner that inherits the text colour.",
    examples: [{ title: "Sizes & colours", file: "spinner/sizes.tsx", Demo: SpinnerSizes }],
  },
  {
    slug: "skeleton",
    name: "Skeleton",
    category: "Feedback",
    status: "live",
    source: "components/ui/Skeleton.tsx",
    summary: "Shimmer block — the base unit of every loading skeleton.",
    examples: [{ title: "List rows", file: "skeleton/list-row.tsx", Demo: SkeletonListRow }],
  },
  {
    slug: "urgency-badge",
    name: "Urgency badge",
    category: "Data display",
    status: "live",
    source: "components/ui/UrgencyBadge.tsx",
    summary: "Filled pill for order urgency.",
    examples: [{ title: "All urgencies", file: "urgency-badge/all.tsx", Demo: UrgencyBadgeAll }],
  },
  {
    slug: "status-glow-badge",
    name: "Status glow badge",
    category: "Data display",
    status: "live",
    source: "components/ui/StatusGlowBadge.tsx",
    summary: "Production status as coloured, pulsing text; delayed pulses red and faster.",
    examples: [{ title: "All statuses", file: "status-glow-badge/all.tsx", Demo: StatusGlowBadgeAll }],
  },
  {
    slug: "section-label",
    name: "Section label",
    category: "Data display",
    status: "live",
    source: "components/ui/SectionLabel.tsx",
    summary: "Small uppercase eyebrow above a section.",
    examples: [{ title: "Basic", file: "section-label/basic.tsx", Demo: SectionLabelBasic }],
  },
  {
    slug: "ticket-card",
    name: "Ticket card",
    category: "Data display",
    status: "draft",
    source: "components/ui/TicketCard.tsx",
    summary: "Ticket-style summary card: coloured code/date strip, status pill, dashed tear line, amount and actions.",
    examples: [{ title: "Collection", file: "ticket-card/collection.tsx", Demo: TicketCardCollection }],
  },
];
