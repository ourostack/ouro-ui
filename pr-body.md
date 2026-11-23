Fixes #3246.

Several `skeleton.test.tsx` cases hold the main thread right after mounting a
first `Skeleton`, mount a late one, wait a fixed number of chained
`requestAnimationFrame`s, then assert the pair share a phase. That wait
assumes the skeleton's own clock-correction (the `animation.ready.then(...)`
write the prior host-hold fix added) lands within that frame count.

It does not land within that frame count reliably: `ready`'s resolution is
gated on the browser's own animation pipeline, and a freshly created
`CSSAnimation` can resolve `ready` a frame or more later than one that has
already been settling, under load. When the fixed wait ends first, the test
reads the animation's native, uncorrected `currentTime`, which reflects
wall-clock time since mount including the hold, producing an outsized gap.

This is a test-side race, not a Skeleton bug: the correction finishes on its
own promise-and-frame chain, not a fixed frame count. The fix polls the phase
gap itself with [`expect.poll`](registry/ouro/components/ouro/skeleton/skeleton.test.tsx "verify:fileLine(registry/ouro/components/ouro/skeleton/skeleton.test.tsx, /await expect\.poll\(\(\) => phase\(first\)\)\.toBeGreaterThan\(1300\)/)"), an idiom this file already uses for other
animation-settling waits, so each assertion waits for the gap to close instead
of guessing how many frames that takes.

The only file this pull request touches is [the test file](registry/ouro/components/ouro/skeleton/skeleton.test.tsx "verify:fileLine(registry/ouro/components/ouro/skeleton/skeleton.test.tsx, /describe\("Skeleton"/)"); `skeleton.tsx`'s correction from #3240 is untouched.
