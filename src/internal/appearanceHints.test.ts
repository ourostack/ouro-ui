import { describe, expect, it } from "vitest";
import { radiusFor, sizeFor, toneFor } from "./appearanceHints.ts";

describe("toneFor", () => {
  it.each([
    ["bg-red-500", "danger"],
    ["text-rose-600", "danger"],
    ["bg-emerald-600", "success"],
    ["border-amber-300", "warning"],
    ["text-gray-500", "neutral"],
    ["bg-black", "neutral"],
    ["bg-blue-500", "accent"],
    ["bg-[#123456]", "accent"],
  ])("maps %s to %s", (token, tone) => expect(toneFor(token)).toBe(tone));
});

describe("sizeFor", () => {
  const scale = ["XS", "SM", "BASE", "LG", "XL", "2XL", "BIG"] as const;
  it.each([
    ["text-xs", "XS"],
    ["text-sm", "SM"],
    ["text-base", "BASE"],
    ["text-lg", "LG"],
    ["text-xl", "XL"],
    ["text-2xl", "2XL"],
    ["text-3xl", "BIG"],
    ["text-9xl", "BIG"],
  ])("maps %s to %s", (token, size) => expect(sizeFor(token, scale)).toBe(size));

  it.each(["text-red-500", "text-[13px]", "font-bold"])("ignores %s", (token) =>
    expect(sizeFor(token, scale)).toBeUndefined(),
  );
});

describe("radiusFor", () => {
  it.each([
    ["rounded-none", "0px"],
    ["rounded-full", "999px"],
    ["rounded-lg", "12px"],
    ["rounded", "12px"],
  ])("maps %s to a %s control radius", (token, value) =>
    expect(radiusFor(token)).toBe(`defineTheme({ radius: { control: "${value}" } })`),
  );
});
