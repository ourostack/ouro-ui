# Changes in this release

- Fixed: [ScrollArea reads its sizes once, in the next frame, for a burst of changes inside it](registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx "verify:testExists(registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx::ScrollArea > reads sizes once for a burst of changes inside, in the next frame, not after each change)"); it had read them after each change, a forced layout for each while a list mounted its rows.
