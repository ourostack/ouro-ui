import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const TEXT_ONLY_BUDGET = 12;

it("draws a text-only chat message in no more elements than its budget, with no wrapper around a lone bubble", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <Message variant="chat" role="assistant" name="Mara" time="9:41" dateTime="2026-01-01T09:41">
        Morning!
      </Message>,
    ),
  );
  expect(host.querySelectorAll("*").length).toBeLessThanOrEqual(TEXT_ONLY_BUDGET);
  const content = host.querySelector("[data-ouro-message-content]");
  expect(content?.parentElement?.tagName).toBe("DIV");
  expect(content?.parentElement?.hasAttribute("data-ouro-message-content")).toBe(false);
  await act(async () => root.unmount());
  host.remove();
});
