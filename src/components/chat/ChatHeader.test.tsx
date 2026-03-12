// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatHeader } from "./ChatHeader";
import { usePermissionStore } from "@/stores/permissionStore";
import { createStoreReset } from "@/test-utils";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: (sel: (s: { theme: string; setTheme: () => void }) => unknown) =>
    sel({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/stores/layoutStore", () => ({
  useLayoutStore: (sel: (s: { filePanelOpen: boolean; toggleFilePanel: () => void }) => unknown) =>
    sel({ filePanelOpen: false, toggleFilePanel: vi.fn() }),
}));

let mockActiveConversationId: string | null = "conv-1";
vi.mock("@/stores/dataStore", () => ({
  useDataStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      activeConversationId: mockActiveConversationId,
      conversations: [{ id: "conv-1", title: "Test Chat" }],
    }),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-title">{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-desc">{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button data-testid="alert-cancel" {...props}>{children}</button>
  ),
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button data-testid="alert-action" {...props}>{children}</button>
  ),
}));

const resetPermission = createStoreReset(usePermissionStore);
beforeEach(() => {
  vi.clearAllMocks();
  mockActiveConversationId = "conv-1";
});
afterEach(() => {
  cleanup();
  resetPermission();
});

describe("ChatHeader — TrustModeToggle", () => {
  it("renders toggle when activeConversationId exists", () => {
    render(<ChatHeader leftSidebarOpen={true} />);
    expect(screen.getByTestId("trust-mode-toggle")).toBeTruthy();
  });

  it("does not render toggle when no activeConversationId", () => {
    mockActiveConversationId = null;
    render(<ChatHeader leftSidebarOpen={true} />);
    expect(screen.queryByTestId("trust-mode-toggle")).toBeNull();
  });

  it("opens confirm dialog when clicking inactive toggle", async () => {
    const user = userEvent.setup();
    render(<ChatHeader leftSidebarOpen={true} />);
    expect(screen.queryByTestId("alert-dialog")).toBeNull();

    await user.click(screen.getByTestId("trust-mode-toggle"));
    expect(screen.getByTestId("alert-dialog")).toBeTruthy();
  });

  it("enables trust mode after confirming dialog", async () => {
    const user = userEvent.setup();
    render(<ChatHeader leftSidebarOpen={true} />);
    await user.click(screen.getByTestId("trust-mode-toggle"));
    await user.click(screen.getByTestId("alert-action"));

    expect(usePermissionStore.getState().isTrustMode("conv-1")).toBe(true);
  });

  it("does not enable trust mode when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatHeader leftSidebarOpen={true} />);
    await user.click(screen.getByTestId("trust-mode-toggle"));
    await user.click(screen.getByTestId("alert-cancel"));

    expect(usePermissionStore.getState().isTrustMode("conv-1")).toBe(false);
  });

  it("disables trust mode directly when clicking active toggle (no dialog)", async () => {
    const user = userEvent.setup();
    usePermissionStore.getState().enableTrustMode("conv-1");
    render(<ChatHeader leftSidebarOpen={true} />);

    await user.click(screen.getByTestId("trust-mode-toggle"));
    expect(usePermissionStore.getState().isTrustMode("conv-1")).toBe(false);
    expect(screen.queryByTestId("alert-dialog")).toBeNull();
  });

  it("shows amber color when trust mode is active", () => {
    usePermissionStore.getState().enableTrustMode("conv-1");
    render(<ChatHeader leftSidebarOpen={true} />);
    const btn = screen.getByTestId("trust-mode-toggle");
    expect(btn.className).toContain("text-amber-500");
  });

  it("preserves trust mode when conversation switches", () => {
    usePermissionStore.getState().enableTrustMode("conv-1");
    const { rerender } = render(<ChatHeader leftSidebarOpen={true} />);
    expect(usePermissionStore.getState().isTrustMode("conv-1")).toBe(true);

    // Switch to conv-2
    mockActiveConversationId = "conv-2";
    rerender(<ChatHeader leftSidebarOpen={true} />);

    // Trust mode on conv-1 should persist
    expect(usePermissionStore.getState().isTrustMode("conv-1")).toBe(true);
  });
});
