export const SIDEBAR_MIN = 200;
export const CHAT_MIN = 480;
export const FILE_TREE_MIN = 200;
export const FILE_TREE_MAX = 480;
export const FILE_PREVIEW_MIN = 200;

/** Sidebar max: 50% of viewport width */
export function computeSidebarMax(viewportWidth: number): number {
  return Math.max(SIDEBAR_MIN, Math.floor(viewportWidth * 0.5));
}

/** Chat max: viewport minus actual sidebar usage minus 100px buffer for file panel */
export function computeChatMax(
  viewportWidth: number,
  leftOpen: boolean,
  leftSidebarWidth: number,
): number {
  const sidebar = leftOpen ? leftSidebarWidth : SIDEBAR_MIN;
  return Math.max(CHAT_MIN, viewportWidth - sidebar - 100);
}
