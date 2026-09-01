// src/components/ui/index.ts
// Barrel export for the Ka-Agapay admin UI kit.

export { default as PageHeader } from "./PageHeader";
export { default as StatStrip } from "./StatStrip";
export type { StatItem } from "./StatStrip";
export { default as FilterToolbar } from "./FilterToolbar";
export type { FilterField } from "./FilterToolbar";
export { default as DataTable } from "./DataTable";
export type { Column } from "./DataTable";
export { default as StatusBadge } from "./StatusBadge";
export { default as ActionMenu } from "./ActionMenu";
export type { ActionItem } from "./ActionMenu";
export { default as ConfirmDialog } from "./ConfirmDialog";
export { default as EmptyState } from "./EmptyState";
export { default as ModuleTabs } from "./ModuleTabs";
export type { TabItem } from "./ModuleTabs";
export { default as SortableTh } from "./SortableTh";
export {
  default as HistoryDrawer,
  DetailList,
  HistoryTimeline,
  type TimelineEntry,
} from "./HistoryDrawer";
