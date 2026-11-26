# Changes in this release

- Fixed: MessageList shows Jump to latest only with more than a line below the view, so a list opened at a message among the last (an app's first unread) no longer covers its newest message with the jump ([test](registry/ouro/components/ouro/message/message-list.test.tsx "verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > offers no jump to the latest when it opens at a message with the newest in view, and does once the reader scrolls up)")).
