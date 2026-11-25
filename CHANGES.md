# Changes in this release

- New: `Lightbox` takes `framed={false}` to draw its thumbnails edge to edge, matching a message bubble's own corner radius instead of drawing its own hairline frame.
- Fixed: TimeGrid keeps an event's width beside a +N chip, which a browser dropped as invalid CSS, leaving the event a sliver until a reload.
