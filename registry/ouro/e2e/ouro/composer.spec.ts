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
  await expect(page.locator("blockquote[data-ouro-message-quote]")).toContainText("Reply to Mara Quill: ");
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
  const shots: { data: string; at: number }[] = [];
  // CDP can deliver screencast frames out of order, which reads as the box's height stepping backwards;
  // each frame carries the time Chromium captured it, so a batch is read in that order.
  const take = () => shots.splice(0).sort((a, b) => a.at - b.at).map((shot) => shot.data);
  cdp.on("Page.screencastFrame", (event) => {
    shots.push({ data: event.data, at: event.metadata.timestamp ?? 0 });
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  });
  let recording = false;
  const settle = async () => {
    await expect.poll(() => frame.getAttribute("data-ouro-moving")).toBeNull();
    if (!recording) return;
    // Composer's own move lifecycle (composer.tsx's useLayoutEffect) already waits for every
    // animation on the frame's subtree to finish, and one more requestAnimationFrame, before it
    // clears data-ouro-moving, so the DOM is already static by the read above. Under this story's
    // backdrop-filter, Chromium keeps delivering screencast frames of a page that has stopped
    // changing rather than ever falling idle (a 20s wait for a 300ms-quiet window never once saw
    // one here), so wait for new captures to arrive instead of for the stream to go quiet: once a
    // second new frame lands after the DOM is already static, the first of the two can only be the
    // final paint, not one still in flight when the DOM settled.
    const start = shots.length;
    await expect.poll(() => shots.length).toBeGreaterThan(start);
    const afterFirst = shots.length;
    await expect.poll(() => shots.length).toBeGreaterThan(afterFirst);
  };
  const measure = (
    images: string[],
    box: { x: number; y: number; width: number; height: number },
    border: number[],
    radius: number,
  ) =>
    page.evaluate(
      async ({ images, box, border, radius }) => {
        const rows: { top: number; height: number; runs: number }[] = [];
        for (const data of images) {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
          const scale = bitmap.width / innerWidth;
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d", { willReadFrequently: true })!;
          context.drawImage(bitmap, 0, 0);
          // The left border, not the card's own fill, is the one column that is never one of this
          // story's own painted contents: this story's formatting toolbar and its wrapped message
          // text both run out to within a few device pixels of the frame's left edge, so a column
          // sampled past the border for the card's fill crosses real glyphs (the toolbar's icons,
          // the message's own lines) and reads each one as a stray run, with nothing to do with a
          // torn capture. Sampled right at the frame's own left edge, though, the rounded corner
          // curves away from that exact column for the top and bottom `radius` pixels of the frame
          // (the corner's own arc, not the straight side, is what the border traces there), so the
          // one solid run this column finds is `radius` short at each end of the frame's true span;
          // `2 * radius` is added back below once the run itself is found, to read the frame's own
          // true top and height rather than the inset ones this column alone could ever show.
          const x = Math.round(box.x * scale);
          const column = context.getImageData(x, 0, 1, bitmap.height).data;
          const segments: { start: number; end: number }[] = [];
          let start = -1;
          const scanEnd = Math.min(bitmap.height, Math.ceil((box.y + box.height + 20) * scale));
          for (let y = Math.max(0, Math.floor((box.y - 20) * scale)); y < scanEnd; y++) {
            const near = [0, 1, 2].every((channel) => Math.abs(column[y * 4 + channel]! - border[channel]!) <= 6);
            if (near && start < 0) start = y;
            if (!near && start >= 0) {
              segments.push({ start, end: y - 1 });
              start = -1;
            }
          }
          if (start >= 0) segments.push({ start, end: scanEnd - 1 });
          // Past the border, the column runs into this story's own backdrop gradient, which (now
          // that the reference color is the ring tone, not a neutral gray) passes within tolerance
          // for a couple of rows here and there. A real border run spans nearly the whole frame
          // height (minus the two corners this column misses); background noise never does, so
          // drop anything a stray gradient row could make.
          const real = segments.filter((segment) => segment.end - segment.start + 1 >= 8);
          const top = real[0] ? real[0].start / scale - radius : -1;
          const last = real.at(-1) ? real.at(-1)!.end / scale + radius : -1;
          rows.push({ top, height: last - top + 1, runs: real.length });
        }
        return rows;
      },
      { images, box, border, radius },
    );
  await settle();
  const box = (await frame.boundingBox())!;
  const tall = box.height;
  // The clip's own rounding (--ouro-composer-radius) always matches the frame's border-radius
  // (composer.tsx sets it from the same value), so this is the one true radius to sample past.
  const radius = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-ouro-part="frame"]')!).borderTopLeftRadius));
  // The frame's own border legitimately changes color while this click's focus lingers: the Expand
  // button's click is a press, and ouro-base.css's field cue (.ouro-field-cue[data-ouro-pressed-
  // within]) repaints a pressed-focused field's border in the ring tone instead of border-input,
  // for as long as focus stays in the box from that press — which it does here by design, through
  // both clicks, so a user can keep typing through them. A border color read once before the first
  // click is stale for every frame the press-focus cue recolors, so each direction reads its own
  // border color once focus has already landed there, not the pre-click tone.
  const readBorder = () =>
    page.evaluate(() => {
      const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      paint.fillStyle = getComputedStyle(document.querySelector('[data-ouro-part="frame"]')!).borderTopColor;
      paint.fillRect(0, 0, 1, 1);
      return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3);
    });
  const prime = async () => {
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    await expect.poll(() => shots.length).toBeGreaterThan(0);
    shots.length = 0;
  };
  await prime();
  recording = true;
  try {
    await expand.click();
    await settle();
    // Stop the screencast the moment settle() sees the DOM static, so no more of this story's own
    // backdrop-filter idle repaints (settle()'s own comment: Chromium keeps sending screencast
    // frames of a page that has stopped changing) pile up in the batch below; the check() call
    // further on also drops any frame captured after the first one that already reads the move's
    // own destination, since a late repaint here can paint a wholly different part of the page
    // near this same sampled column.
    await cdp.send("Page.stopScreencast");
    const shrinkImages = take();
    const shortBox = (await frame.boundingBox())!;
    const shrinkBorder = await readBorder();
    const shrink = await measure(shrinkImages, box, shrinkBorder, radius);
    expect(shortBox.height).toBeLessThan(tall);
    await prime();
    await expand.click();
    await settle();
    await cdp.send("Page.stopScreencast");
    const growImages = take();
    const growBorder = await readBorder();
    const grow = await measure(growImages, box, growBorder, radius);
    const check = (rows: typeof shrink, from: number, to: number) => {
      const seen = rows.filter((row) => row.height > 0);
      expect(seen.length).toBeGreaterThan(2);
      const sign = Math.sign(to - from);
      // The run's very first frame can still be the paint from just before the click: the shots
      // buffer is cleared right before the click fires, but CDP's screencast can resend one frame
      // it already had queued before it catches up, which shows no match at all for a border that
      // has not turned blue yet (runs 0). That is a one-time startup artifact of this harness, not
      // a capture glitch worth spending the tolerance below on, so drop it before counting those.
      const startTrimmed = seen[0]!.runs === 0 ? seen.slice(1) : seen;
      // Once a frame's own height lands on the move's real destination, every later capture is
      // this story's backdrop-filter still painting frames of a page that stopped changing a
      // moment earlier (settle()'s own comment): data-ouro-moving has already cleared by then, so
      // the DOM was static before any of these captures, and nothing past the first arrival can
      // be a frame of the actual move. Keep through that first arrival and drop the rest, so a
      // late idle repaint that happens to paint a wholly different element near this column (the
      // textarea's own enduring focus ring, not the frame this test samples) cannot read as a
      // second, stale plateau this check was never meant to weigh in on.
      const settledAt = startTrimmed.findIndex((row) => Math.abs(row.height - to) <= 3);
      const body = settledAt < 0 ? startTrimmed : startTrimmed.slice(0, settledAt + 1);
      // CDP's screencast can deliver a bad frame two ways: splicing two different paints into one
      // image (more than one run in a column that never shows more than one outline), or sending
      // a whole frame out of order — a stale, already-superseded paint arriving between two frames
      // that have both already moved past it. Both are capture glitches, not a real size the box
      // passes through twice; tolerate at most one of either kind per run, and no more.
      const torn = new Set(body.flatMap((row, index) => (row.runs !== 1 ? [index] : [])));
      const stale = new Set(
        body.flatMap((row, index) => {
          if (torn.has(index) || index === 0 || index === body.length - 1) return [];
          const prev = body[index - 1]!.height;
          const next = body[index + 1]!.height;
          return (row.height - prev) * sign < -3 && (row.height - next) * sign < -3 ? [index] : [];
        }),
      );
      expect(torn.size + stale.size, "every captured frame but at most one capture glitch paints the box's real, one-outline size").toBeLessThanOrEqual(1);
      const sound = body.filter((_, index) => !torn.has(index) && !stale.has(index));
      expect(Math.abs(sound[0]!.height - from), "the first painted frame is the old size").toBeLessThanOrEqual(Math.abs(to - from) * 0.4 + 3);
      for (let index = 1; index < sound.length; index++) expect((sound[index]!.height - sound[index - 1]!.height) * sign, `frame ${index} of the heights ${body.map((row) => `${row.height}/${row.runs}`).join(" ")}`).toBeGreaterThanOrEqual(-3);
      expect(Math.abs(sound.at(-1)!.height - to)).toBeLessThanOrEqual(3);
    };
    check(shrink, tall, shortBox.height);
    check(grow, shortBox.height, tall);
  } finally {
    await cdp.send("Page.stopScreencast");
  }
});
