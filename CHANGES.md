# Changes in this release

- Ouro check [judges a loading control swap from the bounds at first input, so later input-driven layout neither creates nor hides a swap](test/check-measure.test.ts "verify:testExists(test/check-measure.test.ts::findLoadingIssues: first-paint-swap > judges replacement geometry before the first input, not a later layout (%s))").
- [ConversationList retains the viewport with `revealSelection={false}`](registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx "verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > retains the viewport for automatic selection without losing the current row or subsequent explicit reveal)").
