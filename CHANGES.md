# Changes in this release

- Changed: Composer's rich editor makes Shift+Enter a line break where Enter doesn't send (`expanded`, or `sendOn="mod-enter"`), so a list item holds a line break instead of starting a new item, and a line break in an item reads and writes as Markdown's indented next line (`- a\n  b`).
