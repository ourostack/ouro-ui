// Safari and WKWebView on macOS 26 report no corner-shape support, while Playwright's WebKit draws it
// natively. A project that loads this file first sees the same: the polyfill takes over.
const supports = CSS.supports.bind(CSS);
CSS.supports = ((...args: [string, string?]) => (/corner-shape/.test(args[0]) ? false : (supports as (...a: unknown[]) => boolean)(...args))) as typeof CSS.supports;
