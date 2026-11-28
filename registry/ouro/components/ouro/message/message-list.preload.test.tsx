import { describe, expect, it } from "vitest";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";

// Its own file, so no list has rendered in the page: only MessageList's own code can have asked for its bar layer's.
describe("MessageList's bar layer code", () => {
  it("is fetched as the list's own code loads, before any list renders, so a first list draws the layer on its first frame", async () => {
    expect(MessageList).toBeTypeOf("function");
    const fetched = () => performance.getEntriesByType("resource").some((entry) => /\/components\/ouro\/message\/message-parts\.tsx/.test(entry.name));
    await expect.poll(fetched).toBe(true);
  });
});
