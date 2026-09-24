// src/lib/layout.ts
//
// Measurements two components have to agree on.
//
// The sidebar is fixed-position, so the page content clears it with a matching
// margin. Those two numbers lived separately in Sidebar.tsx and
// DashboardShell.tsx, which is the arrangement where one gets adjusted and the
// other does not, and the content ends up under the navigation.

/** Expanded sidebar, wide enough for the longest label in the menu. */
export const SIDEBAR_WIDTH = 276;

/** Collapsed to icons only. */
export const SIDEBAR_COLLAPSED_WIDTH = 72;

export function sidebarWidth(collapsed: boolean): number {
  return collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
}
