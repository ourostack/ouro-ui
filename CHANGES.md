# Changes in this release

- Fixed: when Ouro Current moves an installed file, it points the app's own scripts and docs at the new path, names a workflow line it cannot change with the change it needs, and leaves a forwarding file at the old path for one release. Ouro AX's shared files go where the package's `#ouro-ax/*` import resolves.
- Fixed: Ouro Current vendors a file that an updated vendored file now imports beside it (Ouro AX's `xray.kit.mts`), and names a whole moved folder by its new path where a script or workflow names it.
- Toaster: when Safari scrolls a newly focused control into view after the stack has checked it, the stack now checks again once the scroll stops, so it no longer stays over that control.
