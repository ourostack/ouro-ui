import { afterEach, describe, expect, it } from "vitest";
import { settle } from "../test/render";

const host = document.createElement("div");
host.innerHTML = '<div style="height:100px;overflow:auto"><div style="height:1000px"></div></div>';

afterEach(() => host.remove());

describe("settle", () => {
  it("waits out a smooth scroll made by code, which no animation lists", async () => {
    document.body.append(host);
    const box = host.firstElementChild as HTMLElement;
    box.scrollTo({ top: 600, behavior: "smooth" });
    await settle();
    expect(box.scrollTop).toBe(600);
  });
});
