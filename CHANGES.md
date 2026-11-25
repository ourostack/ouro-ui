# Changes in this release

- New: [`resolveFoldPosture`](registry/ouro/lib/ouro/fold-posture.ts "verify:fileLine(registry/ouro/lib/ouro/fold-posture.ts, /function resolveFoldPosture/)") brings Ouro HX for Apple's fold-posture rules to the web: book, tabletop, closed or one page, from a container's size, hinge and fold regions (#3546).
- New: `useFoldPosture` and `useFoldHostInput` (`lib/ouro/use-fold-posture.ts`) read a native host's reported fold hinge and regions through a `window` CustomEvent bridge and resolve them with `resolveFoldPosture`.
- New: [`resolveFoldNavPlacement`](registry/ouro/lib/ouro/fold-nav-placement.ts "verify:fileLine(registry/ouro/lib/ouro/fold-nav-placement.ts, /function resolveFoldNavPlacement/)") decides where an app's places go for a fold posture and screen size — a bottom bar, a side rail, or a rail pinned to one pane of a book or tabletop split — so a bar and a rail never pick different breakpoints (#3591).
