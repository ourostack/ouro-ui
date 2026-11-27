# Changes in this release

- Fixed: [ConversationList's more button and section grip take at least 24px to a mouse](registry/ouro/components/ouro/conversation-list/conversation-list.hover.test.tsx "verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.hover.test.tsx::ConversationList hover > gives the more button and the section grip a hit area of at least 24px to a mouse, the size they draw unchanged)"), WCAG 2.5.8's minimum, through `TouchTarget`'s new `fine` mode; they draw at 28×20 as before (#3973).
