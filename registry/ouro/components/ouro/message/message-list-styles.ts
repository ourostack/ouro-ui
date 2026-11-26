export { OLDER_CHUNK, isFlingKick };

/**
 * How many older messages go into a list in a frame when a page of them comes at once, to keep each frame short. Shared with
 * the tests, so they read this number rather than a copy of it.
 *
 * @internal
 * @claim "How many older messages go into a list in a frame" registry/ouro/components/ouro/message/message-list.prepend.test.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.prepend.test.tsx, /puts a page of \$\{PAGE\} older messages in over several frames/)
 * @claim "How many older messages go into a list in a frame" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > commits once in the task a page of older messages lands in, holding the reader's row, and draws the page's rows the overscan reaches in later frames, a chunk at most a frame)
 */
const OLDER_CHUNK = 20;

/**
 * Whether a frame's scrolled distance is a kick of the reader's fling, not a jump (End from far up, a link to an old
 * message): `going` says a scroll event since the last frame went on with one already found to be the reader's, which a long
 * frame (a busy page mid-fling) can leave stale, false, on the one frame that first sees a jump-sized distance the reader's
 * own still-latched scroll produced; `scrolling` never goes stale this way, since only `scrollend` clears it. Shared with the
 * tests, so they read this one decision rather than a copy of it.
 *
 * @internal
 * @claim "`going` says a scroll event since the last frame" registry/ouro/components/ouro/message/message-list.springs.touch.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.touch.test.tsx::follows the whole of a fling through a long frame, and settles only once it stops)
 */
const isFlingKick = (going: boolean, scrolling: boolean, scrolled: number, viewHeight: number) => going || scrolling || Math.abs(scrolled) < viewHeight;
