# Changes in this release

- Changed: a windowed ConversationList [forces no layout read while it mounts beyond the first view's](registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx "verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > forces no layout but the first view's while a windowed list mounts, and then sets its window from the observer's first callback)"); the resize observer's first callback finds the scroll container, measures the rows and sets the window.
