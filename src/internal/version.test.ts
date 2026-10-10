import { expect, test } from "vitest";
import pkg from "../../package.json";
import { version } from "./version";

test("version matches package.json", () => {
  expect(version).toBe(pkg.version);
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
});
