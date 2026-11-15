import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const TEXT_ONLY_ELEMENTS = 10;

it("draws a text-only chat message in no more elements than its budget", async () => {
  const host = document.createElement("div");
  host.dataset["testHarness"] = "";
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <Message role="assistant" variant="chat" name="Ana">
        Hello there
      </Message>,
    );
  });
  const count = host.querySelectorAll("*").length;
  await act(async () => root.unmount());
  host.remove();
  expect(count).toBeLessThanOrEqual(TEXT_ONLY_ELEMENTS);
});
