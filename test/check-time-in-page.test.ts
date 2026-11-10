import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { armTime, listenForTime, readTime } from "@/registry/ouro/check/time-check";

it("observes an actual Chromium task and explicitly reports unsupported measurement in WebKit", async () => {
  listenForTime();
  const start = armTime();
  await new Promise<void>((done) => setTimeout(() => {
    const since = performance.now();
    while (performance.now() - since < 150) { /* deliberate fixture task */ }
    done();
  }, 0));
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  if (server.browser === "chromium") {
    await expect.poll(() => readTime(start).tasks?.some((task) => task.duration > 100)).toBe(true);
    const reading = readTime(start);
    expect(reading.status).toBe("measured");
    expect(reading.tasks?.every((task) => task.startTime >= start.since && task.startTime < reading.until!)).toBe(true);
  } else {
    expect(readTime(start)).toMatchObject({ status: "unsupported", reason: "longtask-unavailable" });
    expect(readTime(start).tasks).toBeUndefined();
  }
});
