// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ResizeHandle } from "./ResizeHandle";

afterEach(() => {
  cleanup();
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

describe("ResizeHandle", () => {
  it("renders on the right edge for side=left", () => {
    const { container } = render(
      <ResizeHandle side="left" currentWidth={300} onResize={vi.fn()} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("right-0");
  });

  it("renders on the left edge for side=right", () => {
    const { container } = render(
      <ResizeHandle side="right" currentWidth={300} onResize={vi.fn()} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("left-0");
  });

  it("calls onResize with correct width on drag (side=left)", () => {
    const onResize = vi.fn();
    const { container } = render(
      <ResizeHandle side="left" currentWidth={300} onResize={onResize} minWidth={200} maxWidth={500} />,
    );
    const el = container.firstElementChild as HTMLElement;

    fireEvent.mouseDown(el, { clientX: 100 });
    fireEvent(window, new MouseEvent("mousemove", { clientX: 150 }));

    expect(onResize).toHaveBeenCalledWith(350);
  });

  it("computes delta in reverse for side=right", () => {
    const onResize = vi.fn();
    const { container } = render(
      <ResizeHandle side="right" currentWidth={300} onResize={onResize} minWidth={200} maxWidth={500} />,
    );
    const el = container.firstElementChild as HTMLElement;

    fireEvent.mouseDown(el, { clientX: 200 });
    fireEvent(window, new MouseEvent("mousemove", { clientX: 150 }));

    expect(onResize).toHaveBeenCalledWith(350);
  });

  it("clamps to minWidth", () => {
    const onResize = vi.fn();
    const { container } = render(
      <ResizeHandle side="left" currentWidth={300} onResize={onResize} minWidth={200} maxWidth={500} />,
    );
    const el = container.firstElementChild as HTMLElement;

    fireEvent.mouseDown(el, { clientX: 500 });
    fireEvent(window, new MouseEvent("mousemove", { clientX: 100 }));

    expect(onResize).toHaveBeenCalledWith(200);
  });

  it("clamps to maxWidth", () => {
    const onResize = vi.fn();
    const { container } = render(
      <ResizeHandle side="left" currentWidth={300} onResize={onResize} minWidth={200} maxWidth={500} />,
    );
    const el = container.firstElementChild as HTMLElement;

    fireEvent.mouseDown(el, { clientX: 100 });
    fireEvent(window, new MouseEvent("mousemove", { clientX: 500 }));

    expect(onResize).toHaveBeenCalledWith(500);
  });

  it("sets cursor and userSelect on mousedown, clears on mouseup", () => {
    const { container } = render(
      <ResizeHandle side="left" currentWidth={300} onResize={vi.fn()} />,
    );
    const el = container.firstElementChild as HTMLElement;

    fireEvent.mouseDown(el, { clientX: 100 });
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent(window, new MouseEvent("mouseup"));
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("cleans up event listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(
      <ResizeHandle side="left" currentWidth={300} onResize={vi.fn()} />,
    );

    unmount();

    const events = removeSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("mousemove");
    expect(events).toContain("mouseup");
    removeSpy.mockRestore();
  });

  it("ignores mousemove when not dragging", () => {
    const onResize = vi.fn();
    render(
      <ResizeHandle side="left" currentWidth={300} onResize={onResize} />,
    );

    fireEvent(window, new MouseEvent("mousemove", { clientX: 999 }));
    expect(onResize).not.toHaveBeenCalled();
  });
});
