import { describe, it, expect } from "vitest";
import { createStore } from "zustand/vanilla";
import { createStoreReset, setStoreState } from "../mock-store";

interface TestState {
  count: number;
  name: string;
}

function makeTestStore() {
  return createStore<TestState>()(() => ({
    count: 0,
    name: "initial",
  }));
}

describe("createStoreReset", () => {
  it("restores store to initial state", () => {
    const store = makeTestStore();
    const reset = createStoreReset(store);

    store.setState({ count: 42, name: "modified" });
    expect(store.getState().count).toBe(42);

    reset();
    expect(store.getState()).toEqual({ count: 0, name: "initial" });
  });
});

describe("setStoreState", () => {
  it("partially updates store state", () => {
    const store = makeTestStore();
    setStoreState(store, { count: 10 });

    expect(store.getState().count).toBe(10);
    expect(store.getState().name).toBe("initial");
  });

  it("can update multiple fields", () => {
    const store = makeTestStore();
    setStoreState(store, { count: 5, name: "updated" });

    expect(store.getState()).toEqual({ count: 5, name: "updated" });
  });
});
