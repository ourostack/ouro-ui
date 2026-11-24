import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a composer sends on Enter, starts a new line on Shift+Enter, and clears after sending", async ({ page }) => {
  await openStory(page, "chat-composer--basic");
  const message = page.getByRole("textbox", { name: "Message Mia" });
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await message.pressSequentially("See you");
  await message.press("Shift+Enter");
  await message.pressSequentially("Saturday");
  await message.press("Enter");
  await expect(page.getByRole("list", { name: "Sent" }).getByRole("listitem")).toHaveText("See you\nSaturday");
  await expect(message).toHaveValue("");
  await expect(message).toBeFocused();
});

test("a composer's suggested words stay marked as the person edits around them", async ({ page }) => {
  await openStory(page, "chat-composer--suggested");
  const reply = page.getByRole("textbox", { name: "Reply to Mia" });
  await expect(reply).toHaveAccessibleDescription(/Suggested by your assistant: “Thanks for the notes\.”, “the sourdough starter”\./);
  const marks = page.locator("[data-ouro-highlight]");
  await expect(marks).toHaveText(["Thanks for the notes.", "the sourdough starter"]);
  await reply.press("ControlOrMeta+Home");
  await reply.pressSequentially("Hi Mia! ");
  await expect(marks).toHaveText(["Thanks for the notes.", "the sourdough starter"]);
  await expect(reply).toHaveValue(/^Hi Mia! Thanks for the notes\./);
});

test("a composer with sending off keeps the text and says why", async ({ page }) => {
  await openStory(page, "chat-composer--sending-off");
  const reply = page.getByRole("textbox", { name: "Reply to Mia" });
  await expect(reply).toHaveAccessibleDescription("Sending is off while you review your assistant's draft.");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await reply.press("Enter");
  await expect(reply).toHaveValue("See you Saturday");
});

test("an image catalogue's emoji go in as tokens, from suggestions or the picker, and the sent message draws them", async ({ page }) => {
  await openStory(page, "chat-composer--emoji-tokens");
  const box = page.getByRole("textbox", { name: "Message the release team" });
  await box.fill("Coffee break ");
  await box.press("End");
  await page.keyboard.type(":cof");
  await page.getByRole("option", { name: /Team coffee/ }).click();
  await expect(box).toHaveValue("Coffee break :coffee_time: ");
  await page.getByRole("button", { name: "Insert emoji" }).click();
  await page.getByRole("dialog", { name: "Insert emoji" }).getByRole("button", { name: "Party popper" }).click();
  await expect(box).toHaveValue("Coffee break :coffee_time: :party:");
  // The picker hands focus back as it closes; Enter goes to the box only once it has it.
  await expect(page.getByRole("dialog", { name: "Insert emoji" })).toBeHidden();
  await box.focus();
  await expect(box).toBeFocused();
  await page.keyboard.press("Enter");
  const sent = page.getByRole("list", { name: "Sent" }).getByRole("listitem").last();
  await expect(sent.getByRole("img", { name: "Team coffee" })).toBeVisible();
  await expect(sent.getByRole("img", { name: "Party popper" })).toBeVisible();
});

test("a composer's quote is read with the text, goes with Escape in the empty box, and shows in the sent reply", async ({ page }) => {
  await openStory(page, "chat-composer--quoting");
  const reply = page.getByRole("textbox", { name: "Message Mara" });
  await expect(reply).toHaveAccessibleDescription(/^Quoting Mara Quill: Morning! The venue confirmed/);
  await reply.focus();
  await reply.press("Escape");
  await expect(page.getByRole("button", { name: "Remove quote from Mara Quill" })).toHaveCount(0);
  await expect(reply).toBeFocused();
  await expect(reply).not.toHaveAccessibleDescription(/Quoting/);
});

test("a composer's quote goes with its remove button, and focus goes back to the text", async ({ page }) => {
  await openStory(page, "chat-composer--quoting");
  const reply = page.getByRole("textbox", { name: "Message Mara" });
  await reply.pressSequentially("I have one");
  await page.getByRole("button", { name: "Remove quote from Mara Quill" }).click();
  await expect(page.getByRole("button", { name: "Remove quote from Mara Quill" })).toHaveCount(0);
  await expect(reply).toBeFocused();
  await expect(reply).toHaveValue("I have one");
});

test("a reply sent with a quote shows the quote in its bubble", async ({ page }) => {
  await openStory(page, "chat-composer--quoting");
  const reply = page.getByRole("textbox", { name: "Message Mara" });
  await reply.pressSequentially("I have one");
  await reply.press("Enter");
  await expect(page.locator("blockquote[data-ouro-message-quote]")).toContainText("Quoting Mara Quill: ");
  await expect(page.getByRole("button", { name: "Remove quote from Mara Quill" })).toHaveCount(0);
});

test("an expanded composer starts a new line on Enter, sends on Ctrl+Enter, and collapses on Escape with its text", async ({ page }) => {
  await openStory(page, "chat-composer--expanded");
  const post = page.getByRole("textbox", { name: "New post in Bakers" });
  const expand = page.getByRole("button", { name: "Expand" });
  await expect(expand).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
  await post.press("ControlOrMeta+End");
  await post.press("Enter");
  await post.pressSequentially("Bring a towel.");
  await expect(post).toHaveValue(/fridge\.\nBring a towel\.$/);
  await post.press("Escape");
  await expect(expand).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await expect(post).toBeFocused();
  await expect(post).toHaveValue(/fridge\.\nBring a towel\.$/);
  await expand.click();
  await expect(expand).toHaveAttribute("aria-pressed", "true");
  await expect(post).toBeFocused();
  await post.press("ControlOrMeta+Enter");
  await expect(page.getByRole("list", { name: "Sent" }).getByRole("listitem")).toHaveText(/Bring a towel\.$/);
});

test("under a backdrop-filter, the box opens and closes in painted frames with one outline and no stale size", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Painted frames come from Chromium's screencast");
  await openStory(page, "chat-composer--behind-backdrop");
  const frame = page.locator('[data-ouro-part="frame"]');
  const expand = page.getByRole("button", { name: "Expand" });
  const cdp = await page.context().newCDPSession(page);
  const shots: string[] = [];
  cdp.on("Page.screencastFrame", (event) => {
    shots.push(event.data);
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  });
  const settle = async () => {
    await expect.poll(() => frame.getAttribute("data-ouro-moving")).toBeNull();
    // Frames keep coming after the last change; wait until two reads of the count agree.
    let seen = -1;
    await expect.poll(async () => {
      const now = shots.length;
      const same = now === seen;
      seen = now;
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return same;
    }).toBe(true);
  };
  const measure = (images: string[], box: { x: number; y: number; width: number; height: number }, card: number[]) =>
    page.evaluate(
      async ({ images, box, card }) => {
        const rows: { top: number; height: number; runs: number }[] = [];
        for (const data of images) {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
          const scale = bitmap.width / innerWidth;
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d", { willReadFrequently: true })!;
          context.drawImage(bitmap, 0, 0);
          const x = Math.round((box.x + 3) * scale);
          const column = context.getImageData(x, 0, 1, bitmap.height).data;
          let top = -1;
          let last = -1;
          let runs = 0;
          let inside = false;
          for (let y = Math.floor((box.y - 400) * scale); y < Math.min(bitmap.height, Math.ceil((box.y + box.height + 400) * scale)); y++) {
            if (y < 0) continue;
            const near = [0, 1, 2].every((channel) => Math.abs(column[y * 4 + channel]! - card[channel]!) <= 6);
            if (near && !inside) runs++;
            if (near && top < 0) top = y;
            if (near) last = y;
            inside = near;
          }
          rows.push({ top: top / scale, height: (last - top + 1) / scale, runs });
        }
        return rows;
      },
      { images, box, card },
    );
  await settle();
  const box = (await frame.boundingBox())!;
  const tall = box.height;
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  try {
    await expect.poll(() => shots.length).toBeGreaterThan(0);
    const card = await page.evaluate(() => {
      const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      paint.fillStyle = getComputedStyle(document.querySelector('[data-ouro-part="frame"]')!).backgroundColor;
      paint.fillRect(0, 0, 1, 1);
      return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3);
    });
    shots.length = 0;
    await expand.click();
    await settle();
    const shortBox = (await frame.boundingBox())!;
    const shrink = await measure(shots.splice(0), box, card);
    expect(shortBox.height).toBeLessThan(tall);
    await expand.click();
    await settle();
    const grow = await measure(shots.splice(0), box, card);
    const check = (rows: typeof shrink, from: number, to: number) => {
      const seen = rows.filter((row) => row.height > 0);
      expect(seen.length).toBeGreaterThan(2);
      for (const row of seen) expect(row.runs, "one outline: the card is one unbroken run").toBe(1);
      const sign = Math.sign(to - from);
      expect(Math.abs(seen[0]!.height - from), "the first painted frame is the old size").toBeLessThanOrEqual(Math.abs(to - from) * 0.4 + 3);
      for (let index = 1; index < seen.length; index++) expect((seen[index]!.height - seen[index - 1]!.height) * sign).toBeGreaterThanOrEqual(-3);
      expect(Math.abs(seen.at(-1)!.height - to)).toBeLessThanOrEqual(3);
    };
    check(shrink, tall, shortBox.height);
    check(grow, shortBox.height, tall);
  } finally {
    await cdp.send("Page.stopScreencast");
  }
});
