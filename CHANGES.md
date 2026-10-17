# Changes in this release

- Make the optional Carousel multi-slide touch test measure native last-snap alignment before release and require one final index report, rather than assume a fixed browser fling distance; keep held-finger silence, native input ownership and the duplicate-report check without changing runtime behavior.
- Keep SwipeActions' synthetic pointer identity distinct from the native mouse in its optional tests, cover a real mouse move during a pending touch, and establish keyboard focus before opening; retain exact pointer-capture, gesture, Escape and document-propagation assertions without changing runtime behavior.
