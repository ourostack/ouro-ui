import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUseCounts, useMoments } from "@/registry/ouro/lib/ouro/use-counts";

const NOON = Date.UTC(2026, 10, 19, 12, 34, 56);

describe("createUseCounts", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let beaconSpy: ReturnType<typeof vi.fn>;
  let storageSet: ReturnType<typeof vi.spyOn>;
  let xhrOpen: ReturnType<typeof vi.spyOn>;
  let cookieSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(""));
    beaconSpy = vi.fn(() => true);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { sendBeacon: beaconSpy }));
    storageSet = vi.spyOn(Storage.prototype, "setItem");
    xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    cookieSet = vi.fn();
    vi.spyOn(document, "cookie", "set").mockImplementation(cookieSet);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function nothingLeft() {
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  }

  it("records nothing and sends nothing by default", () => {
    const onReport = vi.fn();
    const counts = createUseCounts({ onReport, now: () => NOON });
    expect(counts.enabled).toBe(false);
    counts.record("disabled-press", { screen: "checkout", part: "pay-button" });
    const report = counts.flush();
    expect(report.counts).toEqual([]);
    expect(onReport).not.toHaveBeenCalled();
    nothingLeft();
  });

  it("uses no network, storage or cookie, even when enabled and flushed", () => {
    const counts = createUseCounts({ now: () => NOON });
    counts.enable();
    counts.record("search-empty", { screen: "search", part: "query-field" });
    counts.flush();
    nothingLeft();
  });

  it("counts each moment by screen and part, hands the report to onReport once, and starts again from zero", () => {
    const onReport = vi.fn();
    const counts = createUseCounts({ onReport, now: () => NOON });
    counts.enable();
    expect(counts.enabled).toBe(true);
    counts.record("disabled-press", { screen: "checkout", part: "pay-button" });
    counts.record("disabled-press", { screen: "checkout", part: "pay-button" });
    counts.record("dialog-dismissed", { screen: "checkout", part: "coupon-dialog" });
    const report = counts.flush();
    expect(report).toEqual({
      day: "2026-11-19",
      counts: [
        { moment: "disabled-press", screen: "checkout", part: "pay-button", count: 2 },
        { moment: "dialog-dismissed", screen: "checkout", part: "coupon-dialog", count: 1 },
      ],
    });
    expect(onReport).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledWith(report);
    expect(counts.flush().counts).toEqual([]);
    expect(onReport).toHaveBeenCalledOnce();
  });

  it("a report holds only a day and counts, and text that could identify someone is counted as other", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const counts = createUseCounts({ now: () => NOON });
    counts.enable();
    counts.record("field-error-left", { screen: "profile", part: "ari@example.com" });
    counts.record("field-error-left", { screen: "user-123456", part: "name-field" });
    counts.record("field-error-left", { screen: "Settings Page", part: "x".repeat(80) });
    const report = counts.flush();
    expect(Object.keys(report).sort()).toEqual(["counts", "day"]);
    expect(report.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const entry of report.counts) expect(Object.keys(entry).sort()).toEqual(["count", "moment", "part", "screen"]);
    expect(JSON.stringify(report)).not.toMatch(/example|123456|Settings|xxxx/);
    expect(report.counts.map((entry) => `${entry.screen}/${entry.part}`).sort()).toEqual(["other/name-field", "other/other", "profile/other"]);
    expect(warn.mock.calls.map((call) => String(call[0])).join("\n")).toContain("[ouro-ui] createUseCounts:");
  });

  it("ignores a moment it does not count, and drops what it held when disabled", () => {
    const counts = createUseCounts({ now: () => NOON });
    counts.enable();
    counts.record("typed-text" as never, { screen: "checkout", part: "pay-button" });
    counts.record("search-empty", { screen: "search", part: "query-field" });
    counts.disable();
    expect(counts.enabled).toBe(false);
    expect(counts.flush().counts).toEqual([]);
    counts.record("search-empty", { screen: "search", part: "query-field" });
    expect(counts.flush().counts).toEqual([]);
  });

  it("reads the real clock when none is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
    try {
      expect(createUseCounts().flush().day).toBe("2026-11-19");
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists the moments it counts", () => {
    expect(useMoments).toHaveLength(7);
  });
});
