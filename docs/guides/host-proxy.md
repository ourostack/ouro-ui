# Proxying a dev build to a host app

A host app that wraps a web view in a native shell can point that web view at a dev server during development, so a change shows up without a rebuild. This page is the contract such a host's own shell or service code should follow to keep the page's origin, sign-in and native channels working while it does. It is the native-shell half of the loop [BuildChip](../BuildChip.md) and [`ouroBuildSource()`](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/lib/ouro/ouro-build-source.ts) draw on; Ouro ships neither the proxy nor the service, since both are specific to the host.

## The rules

- **Serve the page from a dev server on `127.0.0.1`, at the host's own origin.** The host's sign-in flow, its CORS allowlist and any native token channel it exposes to the page are keyed to that origin, so swapping in a different one (a dev server's own port, a tunnel, a CDN preview) breaks them without extra plumbing. The dev server sits behind the host's usual address instead, and the host proxies requests through to it.
- **Hand the dev server's HMR socket through the proxy, unchanged.** A bundler's dev server pushes updates over a WebSocket opened from the page; a proxy that does not forward that upgrade leaves the page polling or stuck on the first load instead of hot-reloading.[^vite-hmr]
- **Add only the page's inline-script hashes and its HMR socket to the Content Security Policy.** A dev server often needs one inline bootstrap script and a `ws:`/`wss:` connect source for the socket; list those additions on the host's existing policy rather than relaxing `script-src` to `unsafe-inline` or widening `connect-src` past what the dev loop needs.[^csp-hash]
- **Keep the proxy off until a person turns it on.** Point the web view at the dev server only after an explicit action (a menu item, a flag, a debug setting), not automatically on launch.
- **Do not let it outlive a restart.** The setting that turns the proxy on is session state, not a saved preference; the host starts pointed at its official build again on the next launch, and a person who wants the dev server re-enables it.
- **Serve the proxy only from a server that identifies itself as the host's own.** The service behind `127.0.0.1` answers only to the host's own client, with whatever handshake or token the host already uses to tell its own processes apart from an unrelated one bound to the same loopback port.

## Prior art

- **Adopt — Capacitor Live Reload.** A Capacitor native shell points its web view at a dev server reachable over the local network and removes that `server` entry from its config once the session ends, so the native app runs its official bundle again on the next launch; that is the same off-by-default, does-not-outlive-a-restart shape this page asks for.[^capacitor]
- **Adopt — Vite's HMR WebSocket.** `ouroBuildSource()` already depends on a Vite dev server's own HMR channel; this page's socket-handling rule is the same requirement restated for a proxy standing in front of that server rather than a browser connecting to it directly.[^vite-hmr]
- **Adopt — CSP's hash-based `script-src`.** Listing a script's hash, rather than loosening the directive to `unsafe-inline`, is the mechanism the specification defines for letting one known inline script run without opening the policy to any other injected script.[^csp-hash]
- **Watch — Electron's security guidance on loading remote content.** Electron's own docs single out displaying content from a server outside the app's packaged bundle as a severe security risk its checklist covers, which is the general caution behind keeping this proxy off by default and tied to a self-identifying server, even though Electron does not define a dev-build proxy contract of its own.[^electron-security]

[^vite-hmr]: https://vite.dev/config/server-options.html#server-hmr verify:urlOk(https://vite.dev/config/server-options.html#server-hmr)
[^csp-hash]: https://www.w3.org/TR/CSP3/#directive-script-src verify:urlOk(https://www.w3.org/TR/CSP3/#directive-script-src)
[^capacitor]: https://capacitorjs.com/docs/guides/live-reload verify:urlOk(https://capacitorjs.com/docs/guides/live-reload)
[^electron-security]: https://www.electronjs.org/docs/latest/tutorial/security verify:urlOk(https://www.electronjs.org/docs/latest/tutorial/security)
