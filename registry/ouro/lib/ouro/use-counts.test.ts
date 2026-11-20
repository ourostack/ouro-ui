import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUseCounts, useMoments, type UseCountReport } from "@/registry/ouro/lib/ouro/use-counts";

const USER_AGENT = navigator.userAgent;
const NOON = Date.UTC(2026, 10, 19, 12, 34, 56);

describe("createUseCounts", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let beaconSpy: ReturnType<typeof vi.fn>;
  let storageSet: ReturnType<typeof vi.spyOn>;
  let xhrOpen: ReturnType<typeof vi.spyOn>;
  let cookieSet: ReturnType<typeof vi.fn<(value: string) => void>>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(""));
    beaconSpy = vi.fn(() => true);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { sendBeacon: beaconSpy }));
    storageSet = vi.spyOn(Storage.prototype, "setItem");
    xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    cookieSet = vi.fn<(value: string) => void>();
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
    const warnings = warn.mock.calls.map((call) => String(call[0]));
    expect(warnings).toContain(
      '[ouro-ui] createUseCounts: part is not a short name from your code, so it is counted as "other". Fix: counts.record("field-error-left", { screen: "checkout", part: "coupon-field" }).',
    );
    expect(warnings.some((text) => text.includes("createUseCounts: screen is not a short name"))).toBe(true);
  });

  it("keeps a short name that holds one or two digits", () => {
    const counts = createUseCounts({ now: () => NOON });
    counts.enable();
    counts.record("search-empty", { screen: "step-2", part: "tab12" });
    expect(counts.flush().counts).toEqual([{ moment: "search-empty", screen: "step-2", part: "tab12", count: 1 }]);
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
  describe("the privacy promise", () => {
    let sends: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

    beforeEach(() => {
      sends = vi.fn<(...args: unknown[]) => void>();
      vi.stubGlobal("WebSocket", function WebSocketStub() { sends("WebSocket"); });
      vi.stubGlobal("EventSource", function EventSourceStub() { sends("EventSource"); });
      vi.stubGlobal("Image", function ImageStub() { sends("Image"); });
      vi.stubGlobal("XMLHttpRequest", function XhrStub() { sends("XMLHttpRequest"); });
      vi.stubGlobal("fetch", (...args: unknown[]) => { sends("fetch", args); return Promise.resolve(new Response("")); });
      vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { sendBeacon: () => { sends("sendBeacon"); return true; } }));
      vi.spyOn(document, "createElement");
    });

    function session(counts: ReturnType<typeof createUseCounts>) {
      counts.enable();
      for (const moment of useMoments) counts.record(moment, { screen: "checkout", part: "pay-button" });
      counts.record("disabled-press", { screen: "https://example.com/a?token=abc", part: "ari@example.com" });
      counts.flush();
      counts.disable();
    }

    it("calls no fetch, beacon, XMLHttpRequest, WebSocket, EventSource or image ping, whether off or on", () => {
      const received: unknown[] = [];
      session(createUseCounts({ onReport: (report) => received.push(report), now: () => NOON }));
      const off = createUseCounts({ now: () => NOON });
      for (const moment of useMoments) off.record(moment, { screen: "checkout", part: "pay-button" });
      off.flush();
      expect(sends).not.toHaveBeenCalled();
      expect(document.createElement).not.toHaveBeenCalledWith("img");
      expect(received).toHaveLength(1);
    });

    it("keeps nothing in memory while off, so counts made before enable() never appear", () => {
      const onReport = vi.fn();
      const counts = createUseCounts({ onReport, now: () => NOON });
      counts.record("disabled-press", { screen: "checkout", part: "pay-button" });
      counts.enable();
      expect(counts.flush().counts).toEqual([]);
      expect(onReport).not.toHaveBeenCalled();
    });

    it("reports only fixed moment names with whole-number counts, and drops or rewrites anything smuggled in", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const received: UseCountReport[] = [];
      const counts = createUseCounts({ onReport: (report) => received.push(report), now: () => NOON });
      counts.enable();
      const smuggled = { screen: "checkout", part: "pay-button", text: "ari@example.com", value: "4111 1111", url: "https://example.com/?q=secret", id: "u-1" };
      counts.record("disabled-press", smuggled as never);
      counts.record("ari@example.com" as never, { screen: "checkout", part: "pay-button" });
      counts.record("search-empty", { screen: "https://example.com/?q=secret", part: "q=secret" });
      counts.record("search-empty", { screen: 42 as never, part: { toString: () => "secret" } as never });
      counts.record("search-empty", { screen: "ABC", part: "a b" });
      counts.record("search-empty", { screen: "id-1234567", part: "\u00e9" });
      counts.record("search-empty", { screen: USER_AGENT, part: "ok-1" });
      const report = counts.flush();
      expect(received).toEqual([report]);
      for (const entry of report.counts) {
        expect(Object.keys(entry).sort()).toEqual(["count", "moment", "part", "screen"]);
        expect(useMoments).toContain(entry.moment);
        expect(typeof entry.screen).toBe("string");
        expect(typeof entry.part).toBe("string");
        expect(entry.screen).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(entry.part).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(Number.isInteger(entry.count)).toBe(true);
        expect(entry.count).toBeGreaterThan(0);
      }
      const json = JSON.stringify(report);
      expect(json).not.toMatch(/example|secret|4111|u-1|1234567|ABC|a b|Mozilla/);
      expect(report.day).toBe("2026-11-19");
      expect(json).not.toContain("12:34");
    });
  });
});
