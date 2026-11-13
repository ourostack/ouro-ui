### Ouro check: 1 page at 21 sizes, light and dark, density 2 (1 above 3072px wide)

| | Page | overlap | sideways scroll | clipped text | long lines | blurry picture | stretched picture | picture fades | accessibility (axe) | broken picture | page did not load | page not ready | layout shift while loading | slow first content | slow press | giant picture | cramped heading | frame in a frame | corner shows through | type scale | shadow scale | grey on colour | heading hierarchy | jank | repaints at rest | leaked value | odd timestamp | console error | failed request | off the screen | control twice | stray scrollbar | no focus ring | missed dark mode | disabled, no reason | no HTTPS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ✗ | `dist /docs/message/` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

✗ fails; · is waived in ouro-check.json. Each finding has a captioned close-up in `findings/`, and each page a contact sheet in `sheets/`.

Opted out on purpose: 1, each with its reason in `report.json` (`allowances`).

<details><summary>Every finding</summary>

| | Page | Rule | Element | At | Example |
|---|---|---|---|---|---|
| ✗ | `dist /docs/message/` | frame in a frame | blockquote.m-0.mb-2.flex in div.box-border.max-w-full.min-w-0 | 42 sizes, 320×640 light to 1000×600 dark | corner radius 14px, 9px inside a 32px corner: the corners nest at 23px |
| ✗ | `dist /docs/message/` | frame in a frame | span.w-1.shrink-0.self-stretch in blockquote.m-0.mb-2.flex | 21 sizes, 320×640 dark to 1000×600 dark | corner radius 2px, 6px inside a 14px corner: the corners nest at 8px |

</details>
