# Changes in this release

- Changed: a Button that mounts already `loading` draws its spinner on the first frame; the spinner fades in only when `loading` turns on after mount.
- New: `Inspector` takes `controls`, which also outlines a page's own buttons, links and fields by role and accessible name, with the AX action they are bound to, so X-ray works on a page built with another library.
