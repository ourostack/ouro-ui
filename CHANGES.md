# Changes in this release

- Fixed: a page of older messages that lands in a windowed list draws at most a chunk of rows a frame, even when a frame runs before React has drawn the previous chunk ([test](registry/ouro/components/ouro/message/message-list.windowing.test.tsx "verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > does not spend a second chunk on rows the first chunk has not drawn yet, when a frame runs before React commits it)")), so the rows drawn in one frame stay within the chunk.
