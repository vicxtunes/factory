import type { ComponentType } from "react";

import SetupSplitDesktop from "./examples/studio-setup/split-desktop";
import SetupSplitPhone from "./examples/studio-setup/split-phone";
import SetupSplitWelcomePhone from "./examples/studio-setup/split-welcome-phone";
import ChatAttachmentsThread from "./examples/chat-attachments/thread";
import MasonryGalleryClient from "./examples/masonry-gallery/client";
import MasonryGalleryDownloads from "./examples/masonry-gallery/downloads";
import ProjectGalleryDelivery from "./examples/project-gallery/delivery";
import AddMediaButtonOrderItem from "./examples/add-media-button/order-item";
import DownloadAllInParts from "./examples/download-all/in-parts";
import DownloadAllOneZip from "./examples/download-all/one-zip";
import LogoUploaderNoLogo from "./examples/logo-uploader/no-logo";
import LogoUploaderWithLogo from "./examples/logo-uploader/with-logo";
import MediaLinksFiles from "./examples/media-links/files";
import MediaLinksLegacyLink from "./examples/media-links/legacy-link";
import MediaLinksPrinting from "./examples/media-links/printing";
import PhotoUploaderAlbum from "./examples/photo-uploader/album";
import UploadRowStates from "./examples/upload-row/states";
import UploadThumbsStates from "./examples/upload-thumbs/states";
import UploadThumbsTryIt from "./examples/upload-thumbs/try-it";
import UploadRowTryIt from "./examples/upload-row/try-it";
import ActivityFeedCommentsOnly from "./examples/activity-feed/comments-only";
import ActivityFeedEmpty from "./examples/activity-feed/empty";
import ActivityFeedMixed from "./examples/activity-feed/mixed";
import AlbumCardGrid from "./examples/album-card/grid";
import AlbumCardSingle from "./examples/album-card/single";
import AssigneePickerBasic from "./examples/assignee-picker/basic";
import AssigneePickerInTable from "./examples/assignee-picker/in-table";
import AssigneePickerNone from "./examples/assignee-picker/none";
import AvatarPhotoFallback from "./examples/avatar/photo-fallback";
import AvatarSizes from "./examples/avatar/sizes";
import AvatarStackOverflow from "./examples/avatar/stack";
import ButtonStates from "./examples/button/states";
import ButtonVariants from "./examples/button/variants";
import CalendarMonthBusyDay from "./examples/calendar-month/busy-day";
import CalendarMonthLaptop from "./examples/calendar-month/laptop";
import CalendarMonthMonth from "./examples/calendar-month/month";
import CompareSliderBasic from "./examples/compare-slider/basic";
import CompareSliderSquare from "./examples/compare-slider/square";
import CurrencySelectBasic from "./examples/currency-select/basic";
import DataTableBasic from "./examples/data-table/basic";
import DataTableCompact from "./examples/data-table/compact";
import DataTableEmpty from "./examples/data-table/empty";
import DataTableGrouped from "./examples/data-table/grouped";
import DataTableLoading from "./examples/data-table/loading";
import DataTableSelectable from "./examples/data-table/selectable";
import DataTableSortable from "./examples/data-table/sortable";
import DataTableStickyHeader from "./examples/data-table/sticky-header";
import DataTableWithTotals from "./examples/data-table/with-totals";
import DataTableZebra from "./examples/data-table/zebra";
import DateRangeCalendarBasic from "./examples/date-range-calendar/basic";
import DrawerBasic from "./examples/drawer/basic";
import DueDatePickerBasic from "./examples/due-date-picker/basic";
import DueDatePickerCleared from "./examples/due-date-picker/cleared";
import DueDatePickerOverdue from "./examples/due-date-picker/overdue";
import FieldInputs from "./examples/field/inputs";
import InfoTipBasic from "./examples/info-tip/basic";
import KanbanBoardBasic from "./examples/kanban-board/basic";
import KanbanBoardLaptop from "./examples/kanban-board/laptop";
import KanbanBoardReorderColumns from "./examples/kanban-board/reorder-columns";
import KanbanBoardWithLimits from "./examples/kanban-board/with-limits";
import LabelChipsEditable from "./examples/label-chips/editable";
import LabelChipsMany from "./examples/label-chips/many";
import LabelChipsReadOnly from "./examples/label-chips/read-only";
import LightboxBasic from "./examples/lightbox/basic";
import InvoiceViewerStaff from "./examples/invoice-viewer/staff";
import PasswordInputBasic from "./examples/password-input/basic";
import PhotoCarouselBasic from "./examples/photo-carousel/basic";
import PhotoCarouselMobile from "./examples/photo-carousel/mobile";
import PhotoGridBasic from "./examples/photo-grid/basic";
import PhotoGridMobile from "./examples/photo-grid/mobile";
import PhotoGridPick from "./examples/photo-grid/pick";
import PopoverBasic from "./examples/popover/basic";
import ProgressBarBasic from "./examples/progress-bar/basic";
import ProgressBarComplete from "./examples/progress-bar/complete";
import ProgressBarWithValue from "./examples/progress-bar/with-value";
import ProjectCardAtRisk from "./examples/project-card/at-risk";
import ProjectCardCompleted from "./examples/project-card/completed";
import ProjectCardDefault from "./examples/project-card/default";
import ProjectCardGrid from "./examples/project-card/grid";
import ProjectPageLaptop from "./examples/project-page/laptop";
import ProjectPageMobile from "./examples/project-page/mobile";
import ProjectPagePage from "./examples/project-page/page";
import SectionLabelBasic from "./examples/section-label/basic";
import ScrollbarsPanels from "./examples/scrollbars/panels";
import SkeletonListRow from "./examples/skeleton/list-row";
import SpinnerSizes from "./examples/spinner/sizes";
import BottomSheetBasic from "./examples/bottom-sheet/basic";
import ConfirmationBooked from "./examples/confirmation/booked";
import DocumentPayBarQuotation from "./examples/document-pay-bar/quotation";
import StatusGlowBadgeAll from "./examples/status-glow-badge/all";
import StepFormBooking from "./examples/step-form/booking";
import StepFormRail from "./examples/step-form/rail";
import StatusPickerInTable from "./examples/status-picker/in-table";
import StatusPickerPriority from "./examples/status-picker/priority";
import StatusPickerStatus from "./examples/status-picker/status";
import SubtaskChecklistAllDone from "./examples/subtask-checklist/all-done";
import SubtaskChecklistChecklist from "./examples/subtask-checklist/checklist";
import SubtaskChecklistEmpty from "./examples/subtask-checklist/empty";
import TableFiltersBasic from "./examples/table-filters/basic";
import TableFiltersPills from "./examples/table-filters/pills";
import TabsCounts from "./examples/tabs/counts";
import TaskCardDefault from "./examples/task-card/default";
import TaskCardLongTitle from "./examples/task-card/long-title";
import TaskCardMinimal from "./examples/task-card/minimal";
import TaskCardOverdue from "./examples/task-card/overdue";
import TaskDetailDrawer from "./examples/task-detail/drawer";
import TaskDetailFullPage from "./examples/task-detail/full-page";
import TaskDetailReadOnly from "./examples/task-detail/read-only";
import TaskListAllDone from "./examples/task-list/all-done";
import TaskListGrouped from "./examples/task-list/grouped";
import TaskListMobile from "./examples/task-list/mobile";
import TaskTableGroupedByAssignee from "./examples/task-table/grouped-by-assignee";
import TaskTableGroupedByStatus from "./examples/task-table/grouped-by-status";
import TaskTableList from "./examples/task-table/list";
import TaskTableSelectable from "./examples/task-table/selectable";
import TicketCardCollection from "./examples/ticket-card/collection";
import TimelineClickable from "./examples/timeline/clickable";
import TimelineDay from "./examples/timeline/day";
import TimelineLaptop from "./examples/timeline/laptop";
import TimelineWeek from "./examples/timeline/week";
import UrgencyBadgeAll from "./examples/urgency-badge/all";
import WorkloadViewLaptop from "./examples/workload-view/laptop";
import WorkloadViewOverCapacity from "./examples/workload-view/over-capacity";
import WorkloadViewTeam from "./examples/workload-view/team";

// Everything the Design Room shows. To add a component: build it in
// packages/ui/, write its examples under ./examples/<slug>/ (one default
// export per file — the file's source is what the Code tab shows), then add
// an entry here. Flip status to "live" once a real page uses it. Sample
// data shared across several examples lives in ./examples/_data/.

export const CATEGORIES = ["Flows", "Actions", "Inputs", "Navigation", "Overlays", "Feedback", "Data display", "Project management", "Media", "Uploads & downloads"] as const;

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
    slug: "studio-setup",
    name: "Business set-up",
    category: "Flows",
    status: "live",
    source: "packages/ui/studio-access/SetupLayouts.tsx (SetupSplit, SetupWelcome, SetupActions)",
    summary: "A new business's set-up (chose the split panel): the steps in a navy panel beside the form; on phones a compact step header and buttons pinned to the bottom. Click through it.",
    examples: [
      { title: "Desktop", file: "studio-setup/split-desktop.tsx", Demo: SetupSplitDesktop },
      { title: "Phone", file: "studio-setup/split-phone.tsx", Demo: SetupSplitPhone },
      { title: "Welcome, phone", file: "studio-setup/split-welcome-phone.tsx", Demo: SetupSplitWelcomePhone },
    ],
  },
  {
    slug: "step-form",
    name: "Step form",
    category: "Flows",
    status: "live",
    source: "packages/ui/StepForm.tsx (StepForm, StepRail, ChoiceGroup)",
    summary: "A long form as one card: a numbered rail (done steps ticked), the open step's heading and fields, option cards and tiles, and Previous / Continue under a rule. Click through it.",
    examples: [
      { title: "New booking", file: "step-form/booking.tsx", Demo: StepFormBooking },
      { title: "Rail, five steps", file: "step-form/rail.tsx", Demo: StepFormRail },
    ],
  },
  {
    slug: "bottom-sheet",
    name: "Bottom sheet",
    category: "Overlays",
    status: "live",
    source: "packages/ui/BottomSheet.tsx",
    summary: "One short task (pay, book, confirm) in a sheet that rises from the bottom of a phone, under the thumb; a centered card on wide screens. Use the Drawer for long panels.",
    examples: [{ title: "Pay to confirm", file: "bottom-sheet/basic.tsx", Demo: BottomSheetBasic }],
  },
  {
    slug: "confirmation",
    name: "Confirmation",
    category: "Feedback",
    status: "live",
    source: "packages/ui/Confirmation.tsx",
    summary: "The success screen at the end of a task: a ticked seal, what happened, what's next, and the way on.",
    examples: [{ title: "Booked", file: "confirmation/booked.tsx", Demo: ConfirmationBooked }],
  },
  {
    slug: "document-pay-bar",
    name: "Document pay bar",
    category: "Flows",
    status: "live",
    source: "packages/ui/billing/DocumentPayBar.tsx (with packages/ui/payments/PayNow.tsx)",
    summary: "Pinned under a quotation or invoice on its link: what it is, from whom to whom, what's to pay and by when, and one action (Approve & Pay / Pay) that opens the pay sheet and ends on a confirmation.",
    examples: [{ title: "Quotation", file: "document-pay-bar/quotation.tsx", Demo: DocumentPayBarQuotation }],
  },
  {
    slug: "button",
    name: "Button",
    category: "Actions",
    status: "live",
    source: "packages/ui/Button.tsx",
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
    source: "packages/ui/Field.tsx",
    summary: "Label + hint wrapper with the shared TextInput, TextArea and Select styling.",
    examples: [{ title: "Text, number, select, textarea", file: "field/inputs.tsx", Demo: FieldInputs }],
  },
  {
    slug: "password-input",
    name: "Password input",
    category: "Inputs",
    status: "live",
    source: "packages/ui/PasswordInput.tsx",
    summary: "Masked password/PIN field with a reveal toggle.",
    examples: [{ title: "PIN", file: "password-input/basic.tsx", Demo: PasswordInputBasic }],
  },
  {
    slug: "currency-select",
    name: "Currency select",
    category: "Inputs",
    status: "live",
    source: "packages/ui/CurrencySelect.tsx",
    summary: "Compact currency picker; renders nothing when only the base currency exists.",
    examples: [{ title: "Two currencies", file: "currency-select/basic.tsx", Demo: CurrencySelectBasic }],
  },
  {
    slug: "date-range-calendar",
    name: "Date range calendar",
    category: "Inputs",
    status: "live",
    source: "packages/ui/DateRangeCalendar.tsx",
    summary: "Desktop range picker — click a start day, then an end day.",
    examples: [{ title: "Range", file: "date-range-calendar/basic.tsx", Demo: DateRangeCalendarBasic }],
  },
  {
    slug: "tabs",
    name: "Tabs",
    category: "Navigation",
    status: "live",
    source: "packages/ui/Tabs.tsx",
    summary: "Underlined category tabs with optional count badges; amber tone for counts that need attention.",
    examples: [{ title: "With counts", file: "tabs/counts.tsx", Demo: TabsCounts }],
  },
  {
    slug: "drawer",
    name: "Drawer",
    category: "Overlays",
    status: "live",
    source: "packages/ui/Drawer.tsx",
    summary: "Right-hand sheet for detail panels and forms, with a pinned footer.",
    examples: [{ title: "With footer", file: "drawer/basic.tsx", Demo: DrawerBasic }],
  },
  {
    slug: "popover",
    name: "Popover",
    category: "Overlays",
    status: "live",
    source: "packages/ui/Popover.tsx",
    summary: "Click-to-open panel anchored to a trigger — lighter than a drawer.",
    examples: [{ title: "Filters", file: "popover/basic.tsx", Demo: PopoverBasic }],
  },
  {
    slug: "info-tip",
    name: "Info tip",
    category: "Overlays",
    status: "live",
    source: "packages/ui/InfoTip.tsx",
    summary: "ⓘ button with a tooltip bubble on hover or tap.",
    examples: [{ title: "Product note", file: "info-tip/basic.tsx", Demo: InfoTipBasic }],
  },
  {
    slug: "spinner",
    name: "Spinner",
    category: "Feedback",
    status: "live",
    source: "packages/ui/Spinner.tsx",
    summary: "Inline spinner that inherits the text colour.",
    examples: [{ title: "Sizes & colours", file: "spinner/sizes.tsx", Demo: SpinnerSizes }],
  },
  {
    slug: "scrollbars",
    name: "Scrollbars",
    category: "Data display",
    status: "live",
    source: "packages/ui/theme.css",
    summary: "Every scroll area: thin, no track, a soft brand-orange thumb (full orange on hover in Safari).",
    examples: [{ title: "Vertical and both ways", file: "scrollbars/panels.tsx", Demo: ScrollbarsPanels }],
  },
  {
    slug: "skeleton",
    name: "Skeleton",
    category: "Feedback",
    status: "live",
    source: "packages/ui/Skeleton.tsx",
    summary: "Shimmer block — the base unit of every loading skeleton.",
    examples: [{ title: "List rows", file: "skeleton/list-row.tsx", Demo: SkeletonListRow }],
  },
  {
    slug: "urgency-badge",
    name: "Urgency badge",
    category: "Data display",
    status: "live",
    source: "packages/ui/UrgencyBadge.tsx",
    summary: "Filled pill for order urgency.",
    examples: [{ title: "All urgencies", file: "urgency-badge/all.tsx", Demo: UrgencyBadgeAll }],
  },
  {
    slug: "status-glow-badge",
    name: "Status glow badge",
    category: "Data display",
    status: "live",
    source: "packages/ui/StatusGlowBadge.tsx",
    summary: "Production status as coloured, pulsing text; delayed pulses red and faster.",
    examples: [{ title: "All statuses", file: "status-glow-badge/all.tsx", Demo: StatusGlowBadgeAll }],
  },
  {
    slug: "section-label",
    name: "Section label",
    category: "Data display",
    status: "live",
    source: "packages/ui/SectionLabel.tsx",
    summary: "Small uppercase eyebrow above a section.",
    examples: [{ title: "Basic", file: "section-label/basic.tsx", Demo: SectionLabelBasic }],
  },
  {
    slug: "data-table",
    name: "Data table",
    category: "Data display",
    status: "draft",
    source: "packages/ui/DataTable.tsx",
    summary: "Table shell — header row, hover/empty/loading states, sort, select, grouping and totals — around caller-defined columns.",
    examples: [
      { title: "Rows", file: "data-table/basic.tsx", Demo: DataTableBasic },
      { title: "Striped rows", file: "data-table/zebra.tsx", Demo: DataTableZebra },
      { title: "Compact density", file: "data-table/compact.tsx", Demo: DataTableCompact },
      { title: "Sortable headers", file: "data-table/sortable.tsx", Demo: DataTableSortable },
      { title: "Selectable rows", file: "data-table/selectable.tsx", Demo: DataTableSelectable },
      { title: "Grouped rows", file: "data-table/grouped.tsx", Demo: DataTableGrouped },
      { title: "Sticky header", file: "data-table/sticky-header.tsx", Demo: DataTableStickyHeader },
      { title: "With totals footer", file: "data-table/with-totals.tsx", Demo: DataTableWithTotals },
      { title: "Loading", file: "data-table/loading.tsx", Demo: DataTableLoading },
      { title: "Empty state", file: "data-table/empty.tsx", Demo: DataTableEmpty },
    ],
  },
  {
    slug: "table-filters",
    name: "Table filters",
    category: "Data display",
    status: "draft",
    source: "packages/ui/TableFilters.tsx",
    summary: "Standard filter bar for a table: search + export on one row, status tabs on the next. Caller owns the filtering.",
    examples: [
      { title: "Search, status tabs & export", file: "table-filters/basic.tsx", Demo: TableFiltersBasic },
      { title: "Search, filter pills & export", file: "table-filters/pills.tsx", Demo: TableFiltersPills },
    ],
  },
  {
    slug: "ticket-card",
    name: "Ticket card",
    category: "Data display",
    status: "draft",
    source: "packages/ui/TicketCard.tsx",
    summary: "Ticket-style summary card: coloured code/date strip, status pill, dashed tear line, amount and actions.",
    examples: [{ title: "Collection", file: "ticket-card/collection.tsx", Demo: TicketCardCollection }],
  },
  {
    slug: "avatar",
    name: "Avatar",
    category: "Project management",
    status: "draft",
    source: "packages/ui/Avatar.tsx",
    summary: "A person's photo, or coloured initials when there's none or it fails to load; AvatarStack overlaps several with a +N.",
    examples: [
      { title: "Photo with initials fallback", file: "avatar/photo-fallback.tsx", Demo: AvatarPhotoFallback },
      { title: "Sizes", file: "avatar/sizes.tsx", Demo: AvatarSizes },
      { title: "Stack with overflow", file: "avatar/stack.tsx", Demo: AvatarStackOverflow },
    ],
  },
  {
    slug: "progress-bar",
    name: "Progress bar",
    category: "Project management",
    status: "draft",
    source: "packages/ui/ProgressBar.tsx",
    summary: "Thin completion bar with an optional fraction or percent readout; turns green when complete.",
    examples: [
      { title: "Basic", file: "progress-bar/basic.tsx", Demo: ProgressBarBasic },
      { title: "With value", file: "progress-bar/with-value.tsx", Demo: ProgressBarWithValue },
      { title: "Complete", file: "progress-bar/complete.tsx", Demo: ProgressBarComplete },
    ],
  },
  {
    slug: "task-card",
    name: "Task card",
    category: "Project management",
    status: "draft",
    source: "packages/ui/TaskCard.tsx",
    summary: "Compact task summary — title, priority, due date, subtask progress and assignees — for boards and lists.",
    examples: [
      { title: "Default", file: "task-card/default.tsx", Demo: TaskCardDefault },
      { title: "Overdue", file: "task-card/overdue.tsx", Demo: TaskCardOverdue },
      { title: "Title only", file: "task-card/minimal.tsx", Demo: TaskCardMinimal },
      { title: "Long title & many assignees", file: "task-card/long-title.tsx", Demo: TaskCardLongTitle },
    ],
  },
  {
    slug: "kanban-board",
    name: "Kanban board",
    category: "Project management",
    status: "draft",
    source: "packages/ui/KanbanBoard.tsx",
    summary: "Columns of cards — drag cards and columns, or move them from each ⋯ menu on touch and keyboard. WIP limits turn a column amber.",
    examples: [
      { title: "Board", file: "kanban-board/basic.tsx", Demo: KanbanBoardBasic },
      { title: "With WIP limits", file: "kanban-board/with-limits.tsx", Demo: KanbanBoardWithLimits },
      { title: "Reorder columns", file: "kanban-board/reorder-columns.tsx", Demo: KanbanBoardReorderColumns },
      { title: "In a laptop frame", file: "kanban-board/laptop.tsx", Demo: KanbanBoardLaptop },
    ],
  },
  {
    slug: "task-table",
    name: "Task table",
    category: "Project management",
    status: "draft",
    source: "packages/ui/DataTable.tsx + packages/ui/TableFilters.tsx",
    summary: "A task list built from DataTable and TableFilters — filter pills, sorting, export, grouped and collapsible rows, bulk select.",
    examples: [
      { title: "Task list", file: "task-table/list.tsx", Demo: TaskTableList },
      { title: "Grouped by status", file: "task-table/grouped-by-status.tsx", Demo: TaskTableGroupedByStatus },
      { title: "Grouped by assignee", file: "task-table/grouped-by-assignee.tsx", Demo: TaskTableGroupedByAssignee },
      { title: "Selectable with bulk actions", file: "task-table/selectable.tsx", Demo: TaskTableSelectable },
    ],
  },
  {
    slug: "task-list",
    name: "My tasks",
    category: "Project management",
    status: "draft",
    source: "packages/ui/TaskList.tsx",
    summary: "Personal to-do list grouped by due date — Overdue, Today, Next 7 days, Later, No date — with tick-to-complete and quick add.",
    examples: [
      { title: "Grouped list", file: "task-list/grouped.tsx", Demo: TaskListGrouped },
      { title: "All done", file: "task-list/all-done.tsx", Demo: TaskListAllDone },
      { title: "In a mobile frame", file: "task-list/mobile.tsx", Demo: TaskListMobile },
    ],
  },
  {
    slug: "timeline",
    name: "Timeline",
    category: "Project management",
    status: "draft",
    source: "packages/ui/Timeline.tsx",
    summary: "Gantt-style schedule — bars from start to end shaded by progress, milestone diamonds, weekend tint and a today line; names stay pinned while dates scroll.",
    examples: [
      { title: "Day scale", file: "timeline/day.tsx", Demo: TimelineDay },
      { title: "Week scale", file: "timeline/week.tsx", Demo: TimelineWeek },
      { title: "Clickable bars", file: "timeline/clickable.tsx", Demo: TimelineClickable },
      { title: "In a laptop frame", file: "timeline/laptop.tsx", Demo: TimelineLaptop },
    ],
  },
  {
    slug: "subtask-checklist",
    name: "Subtask checklist",
    category: "Project management",
    status: "draft",
    source: "packages/ui/SubtaskChecklist.tsx",
    summary: "A task's checklist with progress — tick, add, drag to reorder (or Move up / down from the ⋯ menu), remove.",
    examples: [
      { title: "Checklist", file: "subtask-checklist/checklist.tsx", Demo: SubtaskChecklistChecklist },
      { title: "All done", file: "subtask-checklist/all-done.tsx", Demo: SubtaskChecklistAllDone },
      { title: "Empty with add", file: "subtask-checklist/empty.tsx", Demo: SubtaskChecklistEmpty },
    ],
  },
  {
    slug: "assignee-picker",
    name: "Assignee picker",
    category: "Project management",
    status: "draft",
    source: "packages/ui/AssigneePicker.tsx",
    summary: "Avatars that open a searchable multi-select list of people.",
    examples: [
      { title: "Basic", file: "assignee-picker/basic.tsx", Demo: AssigneePickerBasic },
      { title: "Inline in a table cell", file: "assignee-picker/in-table.tsx", Demo: AssigneePickerInTable },
      { title: "No one assigned", file: "assignee-picker/none.tsx", Demo: AssigneePickerNone },
    ],
  },
  {
    slug: "status-picker",
    name: "Status & priority pickers",
    category: "Project management",
    status: "draft",
    source: "packages/ui/StatusPicker.tsx",
    summary: "Inline single-choice dropdowns for a task's status (coloured dot) and priority (urgency badge); arrow keys move through options.",
    examples: [
      { title: "Status", file: "status-picker/status.tsx", Demo: StatusPickerStatus },
      { title: "Priority", file: "status-picker/priority.tsx", Demo: StatusPickerPriority },
      { title: "In a task table row", file: "status-picker/in-table.tsx", Demo: StatusPickerInTable },
    ],
  },
  {
    slug: "due-date-picker",
    name: "Due date picker",
    category: "Project management",
    status: "draft",
    source: "packages/ui/DueDatePicker.tsx",
    summary: "One due date — Today / Tomorrow / Next week shortcuts over a Monday-first month grid; red once overdue.",
    examples: [
      { title: "Basic", file: "due-date-picker/basic.tsx", Demo: DueDatePickerBasic },
      { title: "Overdue", file: "due-date-picker/overdue.tsx", Demo: DueDatePickerOverdue },
      { title: "No date", file: "due-date-picker/cleared.tsx", Demo: DueDatePickerCleared },
    ],
  },
  {
    slug: "label-chips",
    name: "Label chips",
    category: "Project management",
    status: "draft",
    source: "packages/ui/LabelChips.tsx",
    summary: "Coloured tags on a task — remove with ✕, add or create from a searchable list.",
    examples: [
      { title: "Read-only", file: "label-chips/read-only.tsx", Demo: LabelChipsReadOnly },
      { title: "Editable", file: "label-chips/editable.tsx", Demo: LabelChipsEditable },
      { title: "Many labels (wrapping)", file: "label-chips/many.tsx", Demo: LabelChipsMany },
    ],
  },
  {
    slug: "activity-feed",
    name: "Activity feed",
    category: "Project management",
    status: "draft",
    source: "packages/ui/ActivityFeed.tsx",
    summary: "A task's history — events and comments along a thread, relative times, and a comment box.",
    examples: [
      { title: "Mixed feed", file: "activity-feed/mixed.tsx", Demo: ActivityFeedMixed },
      { title: "Comments only", file: "activity-feed/comments-only.tsx", Demo: ActivityFeedCommentsOnly },
      { title: "Empty", file: "activity-feed/empty.tsx", Demo: ActivityFeedEmpty },
    ],
  },
  {
    slug: "task-detail",
    name: "Task detail",
    category: "Project management",
    status: "draft",
    source: "packages/ui/TaskDetail.tsx",
    summary: "Layout of an opened task — editable title, field grid, description, then sections like subtasks and activity.",
    examples: [
      { title: "Full page", file: "task-detail/full-page.tsx", Demo: TaskDetailFullPage },
      { title: "In a drawer", file: "task-detail/drawer.tsx", Demo: TaskDetailDrawer },
      { title: "Read-only", file: "task-detail/read-only.tsx", Demo: TaskDetailReadOnly },
    ],
  },
  {
    slug: "calendar-month",
    name: "Calendar (month)",
    category: "Project management",
    status: "draft",
    source: "packages/ui/CalendarMonth.tsx",
    summary: "Month grid with tasks as chips on their due date, +N more for busy days, dots on phones.",
    examples: [
      { title: "Month", file: "calendar-month/month.tsx", Demo: CalendarMonthMonth },
      { title: "Busy day overflow", file: "calendar-month/busy-day.tsx", Demo: CalendarMonthBusyDay },
      { title: "In a laptop frame", file: "calendar-month/laptop.tsx", Demo: CalendarMonthLaptop },
    ],
  },
  {
    slug: "project-card",
    name: "Project card",
    category: "Project management",
    status: "draft",
    source: "packages/ui/ProjectCard.tsx",
    summary: "One project at a glance — status pill, progress, members, next milestone, open and overdue counts.",
    examples: [
      { title: "Default", file: "project-card/default.tsx", Demo: ProjectCardDefault },
      { title: "At risk", file: "project-card/at-risk.tsx", Demo: ProjectCardAtRisk },
      { title: "Completed", file: "project-card/completed.tsx", Demo: ProjectCardCompleted },
      { title: "Grid / switcher", file: "project-card/grid.tsx", Demo: ProjectCardGrid },
    ],
  },
  {
    slug: "workload-view",
    name: "Workload",
    category: "Project management",
    status: "draft",
    source: "packages/ui/WorkloadView.tsx",
    summary: "Open tasks per person per week, shaded against capacity — red when someone is overloaded.",
    examples: [
      { title: "Team workload", file: "workload-view/team.tsx", Demo: WorkloadViewTeam },
      { title: "Over capacity", file: "workload-view/over-capacity.tsx", Demo: WorkloadViewOverCapacity },
      { title: "In a laptop frame", file: "workload-view/laptop.tsx", Demo: WorkloadViewLaptop },
    ],
  },
  {
    slug: "project-page",
    name: "Project page",
    category: "Project management",
    status: "draft",
    source: "Composition of the project-management drafts (example only)",
    summary: "Every project-management draft together — project switcher, Board / List / Timeline / Calendar, one search, tasks open in a drawer.",
    examples: [
      { title: "Standalone", file: "project-page/page.tsx", Demo: ProjectPagePage },
      { title: "In a laptop frame", file: "project-page/laptop.tsx", Demo: ProjectPageLaptop },
      { title: "In a mobile frame", file: "project-page/mobile.tsx", Demo: ProjectPageMobile },
    ],
  },
  {
    slug: "photo-grid",
    name: "Photo grid",
    category: "Media",
    status: "draft",
    source: "packages/ui/PhotoGrid.tsx",
    summary: "Square thumbnails that fit their container; tap to open, or pick photos (numbered, with a limit) for an album.",
    examples: [
      { title: "Grid with viewer", file: "photo-grid/basic.tsx", Demo: PhotoGridBasic },
      { title: "Picking photos", file: "photo-grid/pick.tsx", Demo: PhotoGridPick },
      { title: "In a mobile frame", file: "photo-grid/mobile.tsx", Demo: PhotoGridMobile },
    ],
  },
  {
    slug: "lightbox",
    name: "Lightbox",
    category: "Media",
    status: "draft",
    source: "packages/ui/Lightbox.tsx",
    summary: "Full-screen photo viewer — prev / next, arrow keys, swipe, counter, thumbnail strip, optional Pick toggle.",
    examples: [
      { title: "Viewer", file: "lightbox/basic.tsx", Demo: LightboxBasic },
    ],
  },
  {
    slug: "invoice-viewer",
    name: "Invoice viewer",
    category: "Overlays",
    status: "draft",
    source: "packages/ui/invoices/InvoiceViewer.tsx",
    summary: "Opening an invoice: the real PDF, large, full screen; share actions as icons; what's owed and Record payment on the side.",
    examples: [
      { title: "Staff opening an invoice", file: "invoice-viewer/staff.tsx", Demo: InvoiceViewerStaff },
    ],
  },
  {
    slug: "photo-carousel",
    name: "Photo carousel",
    category: "Media",
    status: "draft",
    source: "packages/ui/PhotoCarousel.tsx",
    summary: "Hand-driven slideshow — arrows, dots, swipe and arrow keys; photos letterboxed, never cropped.",
    examples: [
      { title: "Carousel", file: "photo-carousel/basic.tsx", Demo: PhotoCarouselBasic },
      { title: "In a mobile frame", file: "photo-carousel/mobile.tsx", Demo: PhotoCarouselMobile },
    ],
  },
  {
    slug: "compare-slider",
    name: "Before / after",
    category: "Media",
    status: "draft",
    source: "packages/ui/CompareSlider.tsx",
    summary: "Drag a divider across two versions of a photo — for signing off colour correction and retouching.",
    examples: [
      { title: "Landscape", file: "compare-slider/basic.tsx", Demo: CompareSliderBasic },
      { title: "Square", file: "compare-slider/square.tsx", Demo: CompareSliderSquare },
    ],
  },
  {
    slug: "album-card",
    name: "Album card",
    category: "Media",
    status: "draft",
    source: "packages/ui/AlbumCard.tsx",
    summary: "A photo album at a glance — stacked cover, title, client, photo count and Draft / Proofing / Approved / Printed status.",
    examples: [
      { title: "Album grid", file: "album-card/grid.tsx", Demo: AlbumCardGrid },
      { title: "Single album", file: "album-card/single.tsx", Demo: AlbumCardSingle },
    ],
  },
  {
    slug: "upload-row",
    name: "Upload row",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/UploadRow.tsx",
    summary: "The shared \"Choose file\" row: button plus its own drop target, with a progress bar when the upload reports one. Used for order, product, marketing and client uploads.",
    examples: [
      { title: "Try it (pretend upload)", file: "upload-row/try-it.tsx", Demo: UploadRowTryIt },
      { title: "States", file: "upload-row/states.tsx", Demo: UploadRowStates },
    ],
  },
  {
    slug: "upload-thumbs",
    name: "Upload thumbnails",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/UploadThumbs.tsx",
    summary: "Goes under an Upload row: every picked file shows at once as a small preview, with ✕ to drop it before sending, a progress ring while it uploads, a tick when it's in, and Retry if it failed. Used by order forms, Add media and album uploads.",
    examples: [
      { title: "Try it (pretend upload)", file: "upload-thumbs/try-it.tsx", Demo: UploadThumbsTryIt },
      { title: "States", file: "upload-thumbs/states.tsx", Demo: UploadThumbsStates },
    ],
  },
  {
    slug: "add-media-button",
    name: "Add media to an order item",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/media/AddMediaButton.tsx",
    summary: "Adds files to an existing order item, or a pasted link instead: thumbnails with progress for each file, Retry on failure, and queued uploads while offline.",
    examples: [{ title: "Order item", file: "add-media-button/order-item.tsx", Demo: AddMediaButtonOrderItem }],
  },
  {
    slug: "photo-uploader",
    name: "Album photo uploader",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/photos/PhotoUploader.tsx",
    summary: "Business album uploads (Cloudflare R2): an Upload row plus thumbnails; each photo is shrunk in the browser and sent three at a time, with progress on its thumbnail.",
    examples: [{ title: "Album", file: "photo-uploader/album.tsx", Demo: PhotoUploaderAlbum }],
  },
  {
    slug: "logo-uploader",
    name: "Logo uploader",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/studio-access/LogoUploader.tsx",
    summary: "A business's logo: preview box plus upload button; shrinks the picture to 512px first. Spinner only, no progress.",
    examples: [
      { title: "No logo yet", file: "logo-uploader/no-logo.tsx", Demo: LogoUploaderNoLogo },
      { title: "With a logo", file: "logo-uploader/with-logo.tsx", Demo: LogoUploaderWithLogo },
    ],
  },
  {
    slug: "media-links",
    name: "Order item files",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/media/MediaLinks.tsx",
    summary: "An order item's attachments: photo thumbnails with a viewer, file and link buttons, one-by-one downloads (Save As on Chrome) and a server-made zip. On staff screens a photo isn't fetched until someone presses its cloud button, and downloaded files show a tick (hover to download again) with who and when.",
    examples: [
      { title: "Staff, while printing", file: "media-links/printing.tsx", Demo: MediaLinksPrinting },
      { title: "Photos, a PDF and a link", file: "media-links/files.tsx", Demo: MediaLinksFiles },
      { title: "Old orders: pasted link only", file: "media-links/legacy-link.tsx", Demo: MediaLinksLegacyLink },
    ],
  },
  {
    slug: "download-all",
    name: "Download album",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/photos/DownloadAll.tsx",
    summary: "Downloads a whole album, zipped in the browser in parts of 50 so a phone can manage it.",
    examples: [
      { title: "One zip", file: "download-all/one-zip.tsx", Demo: DownloadAllOneZip },
      { title: "In parts", file: "download-all/in-parts.tsx", Demo: DownloadAllInParts },
    ],
  },
  {
    slug: "project-gallery",
    name: "Project gallery (business)",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/photos/ProjectGalleryPanel.tsx",
    summary: "A business's delivered photos on a project: storage used, the album uploader, the uploaded photos to manage, and the share link for the client.",
    examples: [{ title: "Delivery", file: "project-gallery/delivery.tsx", Demo: ProjectGalleryDelivery }],
  },
  {
    slug: "masonry-gallery",
    name: "Client gallery",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/photos/MasonryGallery.tsx",
    summary: "How clients and share-link visitors see delivered photos: a masonry grid of small copies and a full-screen viewer, with per-photo downloads on deliveries.",
    examples: [
      { title: "Gallery", file: "masonry-gallery/client.tsx", Demo: MasonryGalleryClient },
      { title: "With downloads", file: "masonry-gallery/downloads.tsx", Demo: MasonryGalleryDownloads },
    ],
  },
  {
    slug: "chat-attachments",
    name: "Chat attachments",
    category: "Uploads & downloads",
    status: "live",
    source: "packages/ui/chat/MessageBubble.tsx (AttachmentView) + packages/ui/chat/VoicePlayer.tsx",
    summary: "Files sent in chat: photos open in a new tab, files download, voice notes play inline. Shows \"(unavailable)\" when the link couldn't be made.",
    examples: [{ title: "In a thread", file: "chat-attachments/thread.tsx", Demo: ChatAttachmentsThread }],
  },
];
