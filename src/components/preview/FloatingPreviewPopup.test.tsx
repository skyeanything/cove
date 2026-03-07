// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FloatingPreviewProvider } from "./FloatingPreviewPopup";
import { useFloatingPreview } from "@/hooks/useFloatingPreview";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockOpenPreviewWindow = vi.fn();
vi.mock("@/lib/preview-window", () => ({
  openPreviewWindow: (...args: unknown[]) => mockOpenPreviewWindow(...args),
}));

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ activeWorkspace: { path: "/workspace" } }),
}));

afterEach(() => {
  mockOpenPreviewWindow.mockClear();
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function ContextConsumer() {
  const ctx = useFloatingPreview();
  return (
    <div
      data-testid="consumer"
      data-has-context={ctx !== null ? "true" : "false"}
    >
      {ctx && (
        <button onClick={() => ctx.openPopup("/workspace/notes.md")}>
          open notes
        </button>
      )}
    </div>
  );
}

function renderProvider() {
  return render(
    <FloatingPreviewProvider>
      <ContextConsumer />
    </FloatingPreviewProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FloatingPreviewProvider — children", () => {
  it("renders its children", () => {
    render(
      <FloatingPreviewProvider>
        <span data-testid="child">hello</span>
      </FloatingPreviewProvider>,
    );
    expect(screen.getByTestId("child").textContent).toBe("hello");
  });

  it("provides a non-null context value to children", () => {
    renderProvider();
    expect(screen.getByTestId("consumer").dataset.hasContext).toBe("true");
  });
});

describe("FloatingPreviewProvider — openPopup", () => {
  it("calls openPreviewWindow with path and workspaceRoot", () => {
    renderProvider();
    fireEvent.click(screen.getByText("open notes"));
    expect(mockOpenPreviewWindow).toHaveBeenCalledWith(
      "/workspace/notes.md",
      "/workspace",
    );
  });

  it("calls openPreviewWindow each time openPopup is invoked", () => {
    renderProvider();
    fireEvent.click(screen.getByText("open notes"));
    fireEvent.click(screen.getByText("open notes"));
    expect(mockOpenPreviewWindow).toHaveBeenCalledTimes(2);
  });
});

describe("useFloatingPreview — outside provider", () => {
  it("returns null when no provider is present", () => {
    let ctx: ReturnType<typeof useFloatingPreview> = undefined as never;
    function Probe() {
      ctx = useFloatingPreview();
      return null;
    }
    render(<Probe />);
    expect(ctx).toBeNull();
  });
});
