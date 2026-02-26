import type { StoreApi } from "zustand";

/**
 * Captures the initial state of a Zustand store and returns a function
 * that resets the store back to that initial state.
 *
 * Usage in afterEach:
 * ```ts
 * const resetStore = createStoreReset(useChatStore);
 * afterEach(() => resetStore());
 * ```
 */
export function createStoreReset<T extends object>(
  store: StoreApi<T>,
): () => void {
  const initialState = store.getState();
  return () => {
    store.setState(initialState, true);
  };
}

/**
 * Partially update a Zustand store's state for test setup.
 *
 * Usage:
 * ```ts
 * setStoreState(useChatStore, { conversations: [mockConvo] });
 * ```
 */
export function setStoreState<T extends object>(
  store: StoreApi<T>,
  partial: Partial<T>,
): void {
  store.setState(partial);
}
