export { OLDER_CHUNK };

/**
 * How many older messages go into a list in a frame when a page of them comes at once, to keep each frame short. Shared with
 * the tests, so they read this number rather than a copy of it.
 *
 * @internal
 * @claim "How many older messages go into a list in a frame" registry/ouro/components/ouro/message/message-list.prepend.test.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.prepend.test.tsx, /puts a page of \$\{PAGE\} older messages in over several frames/)
 */
const OLDER_CHUNK = 20;
