# Changes in this release

- Fixed: precise failure copy, in the source rules and Ouro AX, rejects a cause that names nothing, such as "Couldn't save: it broke" or "Upload failed: there was a problem" ([test](registry/ouro/ax/precise-copy.test.mts "verify:testExists(registry/ouro/ax/precise-copy.test.mts::finds each vague phrase and a bare failure, and lets precise copy and allowed text through)")).
- Fixed: a quoted message's corners now run concentric with its bubble, through a new `rounded-ouro-inner` utility in ouro-base (the outer radius less the inset, floored at the sm step), and Lightbox clips the zoomed picture to its panel's corners in both themes.
