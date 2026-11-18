export { fragmentFocusScript, FRAGMENT_FOCUS_WAIT_MS };

// Plain text with no hooks, so a Server Component (Next.js's root layout) can render it.

/** @internal How long a link to a place on the page waits for a stylesheet that is loading, at most, in milliseconds. */
const FRAGMENT_FOCUS_WAIT_MS = 2000;

const script =
  `(function(w,d){if(w.__ouroFragmentFocus)return;w.__ouroFragmentFocus=1;` +
  // The stylesheets above the script have loaded (or failed): the parser waited for them before it ran the script.
  `var done=new WeakSet,jump=null,until=0,i,l=d.querySelectorAll('link[rel~="stylesheet"]');for(i=0;i<l.length;i++)done.add(l[i]);` +
  `function loading(){var a=d.querySelectorAll('link[rel~="stylesheet"]'),j;for(j=0;j<a.length;j++)if(!done.has(a[j])&&a[j].getAttribute("href")&&!a[j].disabled&&!/\\balternate\\b/i.test(a[j].rel))return true;return false}` +
  `function follow(){if(jump&&(!loading()||Date.now()>=until)){var h=jump;jump=null;location.assign(h)}}` +
  // A stylesheet's load or error comes after Safari counts it in, so the jump goes once nothing is loading.
  `function settle(e){if(e.target&&e.target.localName==="link"){done.add(e.target);setTimeout(follow)}}` +
  `d.addEventListener("load",settle,true);d.addEventListener("error",settle,true);` +
  // After the page's own handlers: a router that takes the click has prevented it.
  `w.addEventListener("click",function(e){if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;` +
  `var p=e.composedPath(),a,k,u;for(k=0;k<p.length;k++)if((p[k].localName==="a"||p[k].localName==="area")&&typeof p[k].href==="string"&&p[k].hasAttribute("href")){a=p[k];break}` +
  `if(!a||(a.target&&a.target!=="_self")||a.hasAttribute("download"))return;` +
  `u=new URL(a.href);if(!u.hash||u.href.split("#")[0]!==location.href.split("#")[0]||!loading())return;` +
  `e.preventDefault();jump=u.href;until=Date.now()+${FRAGMENT_FOCUS_WAIT_MS};setTimeout(follow,${FRAGMENT_FOCUS_WAIT_MS})})})(window,document)`;

/**
 * The inline script that keeps a person's focus where it is on a page whose address names a place on it (`#reviews`).
 * Safari jumps back to that place each time a stylesheet loads, until the person scrolls, when the page finished parsing
 * or a link to a place on it was followed while a stylesheet was still loading: a slow connection, or a route's CSS
 * that loads as it is used. Each jump takes focus from wherever it was: out of an open menu, or a field mid-word.
 * The script stops both. The parser holds an inline script until the stylesheets above it have loaded, so the page
 * finishes parsing with them in; and a link to a place on the page, clicked while a stylesheet is loading, goes there
 * once it has loaded (two seconds at most). Put it first in `<body>`, after every stylesheet, as an inline classic
 * script: not a module, and not `async` or `defer`. Painting waits for those stylesheets anyway, so nothing shows later.
 * It is plain text, so a Server Component can render it. Use nothing instead on a page with no stylesheet.
 *
 * @group App setup
 * @see https://ui.ouroboros.bot/docs/ouro-provider
 * @example
 * <html lang="en">
 *   <head>{stylesheets}</head>
 *   <body>
 *     <script dangerouslySetInnerHTML={{ __html: fragmentFocusScript() }} />
 *     {children}
 *   </body>
 * </html>
 * @claim "The script stops both" site/e2e/fragment-focus.spec.ts verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, on a page opened at a place while its stylesheet loads)
 * @claim "The script stops both" site/e2e/fragment-focus.spec.ts verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, after a link to a place on the page is followed while a stylesheet loads, and still goes there)
 * @claim "two seconds at most" site/e2e/fragment-focus.spec.ts verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > follows a link to a place on the page after two seconds when a stylesheet is still loading)
 */
function fragmentFocusScript(): string {
  return script;
}
