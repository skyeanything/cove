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
 * Returns the mock so callers can configure per-test return values.
 *
 * Usage:
 * ```ts
 * const db = createMockDb();
 * mockGetDb(db);
 * ```
 */
export function mockGetDb(mockDb: MockDatabase): void {
  vi.mock("@/db", () => ({
    getDb: vi.fn().mockResolvedValue(mockDb),
  }));
}
