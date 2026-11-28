# Changes in this release

- Fix: Message reserves enough height for its action bar beside a short bubble, so the bar no longer overflows past the row's own bottom edge and crowds the next row or the list's own edge
- Fixed: Message's chat/default-layout action bar [rises a fixed 2px less](registry/ouro/components/ouro/message/message-parts.tsx "verify:fileLine(registry/ouro/components/ouro/message/message-parts.tsx, /calc\(2rem-2px\)/)") far above its own bubble, so it reliably clears the minimum gap from the message above it at every scale.
- Message: leave the minimum gap (`--ouro-gap-min`) between a bubble and the attachments, footer or thread under it, and between a run's bubbles; `--ouro-message-run-gap` now defaults to `--ouro-size-2`.
- Fix: MessageList no longer leaves the "Jump to latest" pill overlapping the message a find's own scroll to its current match landed on, away from the list's true bottom
- Fix: MessageList no longer leaves the "Jump to latest" pill hidden, nor overlapping the revealed message, after a code-driven reveal (search or deep link) that scrolls to a message away from the list's true bottom
