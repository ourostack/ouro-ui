import { expect, it, vi } from "vitest";

// The two tests run in order: the first leaves the page's clock fake, as a test that times out
// while it holds the clock does, and the setup file's afterEach gives the second the real one.
it("setup: a test may end with the page's clock still fake", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  expect(vi.isFakeTimers()).toBe(true);
});

it("setup: the next test starts on the real clock", async () => {
  expect(vi.isFakeTimers()).toBe(false);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});
