# Changes in this release

- Changed: Button, Badge, Toggle, ToggleGroup, Tabs, SegmentedControl and Select centre a one-line label on its cap height with `text-box` where the browser draws it, and keep their height.
- Fixed: Inspector (X-ray) marks `data-ouro-settling` on its own layer while a scroll, resize or mutation repositions its outlines with a plain style write outside any CSS transition, so a contrast measurement taken right after scrolling a component into view waits for that reposition too, closing another timing gap behind the flaky "Vegetarian" contrast failure (ourostack/ouro-ui#3361).
