import { expect, test } from "vitest";

// The app's own test, which an upgrade must leave runnable.
test("the app's own test runs", () => {
  expect([1, 2].map((n) => n * 2)).toEqual([2, 4]);
});
