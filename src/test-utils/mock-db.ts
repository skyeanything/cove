import { vi, type Mock } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any;

export interface MockDatabase {
  select: Mock<AnyFn>;
  execute: Mock<AnyFn>;
  close: Mock<AnyFn>;
}

export function createMockDb(
  overrides: Partial<MockDatabase> = {},
): MockDatabase {
  return {
    select: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Mocks the `getDb()` function from `@/db` to return the given MockDatabase.
 * Uses `vi.doMock` (non-hoisted) so the runtime `mockDb` reference is available.
 * Must be called **before** dynamically importing modules that depend on `@/db`.
 *
 * Usage:
 * ```ts
 * const db = createMockDb();
 * mockGetDb(db);
 * const { someRepo } = await import("@/db/repos/someRepo");
 * ```
 */
export function mockGetDb(mockDb: MockDatabase): void {
  vi.doMock("@/db", () => ({
    getDb: vi.fn().mockResolvedValue(mockDb),
  }));
}
