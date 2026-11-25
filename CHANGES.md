# Changes in this release

- Fixed: MessageList lets the space it kept above the first message go as soon as a wheel fling rests at the true top, instead of waiting for a further scroll past it.
- New: [the Ouro AX guide says to answer an agent's "what's new for me?" with one read](docs/guides/ax.md "verify:fileLine(docs/guides/ax.md, /## Answer the question the agent asks/)"): one read that answers the agent's question beats several partial ones, and an agent relays a warning stated as a warning, first, but treats a timestamp as metadata.
- Popover takes `finalFocus`, a ref to the element that gets focus when it closes, as a popover or as a sheet.
