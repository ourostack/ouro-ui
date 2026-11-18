export { fragmentFocusScript, FRAGMENT_FOCUS_WAIT_MS };

// Plain text with no hooks, so a Server Component (Next.js's root layout) can render it.

/** @internal How long a link to a place on the page waits for a stylesheet that is loading, at most, in milliseconds. */
const FRAGMENT_FOCUS_WAIT_MS = 2000;

const script =
  // Only Safari jumps back, so only WebKit (every browser on iOS, and Safari) gets the rest; Chrome and Edge say so.
  `(function(w,d){var ua=navigator.userAgent;if(w.__ouroFragmentFocus||!/AppleWebKit/.test(ua)||/Chrome\\/|Edg\\//.test(ua))return;w.__ouroFragmentFocus=1;` +
  // The stylesheets above the script have loaded (or failed): the parser waited for them before it ran the script.
  `var done=new WeakSet,jump=null,until=0,i,l=d.querySelectorAll('link[rel~="stylesheet"]');for(i=0;i<l.length;i++)done.add(l[i]);` +
  `function pending(x){return !done.has(x)&&x.getAttribute("href")&&!x.disabled&&!/\\balternate\\b/i.test(x.rel)}` +
  `function sheets(){return d.querySelectorAll('link[rel~="stylesheet"]')}` +
  `function loading(){var a=sheets(),j;for(j=0;j<a.length;j++)if(pending(a[j]))return true;return false}` +
  // A stylesheet a deferred or module script added is still loading as the page finishes parsing, when Safari decides.
  // Disabled, it doesn't count; enabled again a moment later, it carries on loading. One that finished meanwhile comes
  // back empty in Safari, so a copy of it loads again.
  `d.addEventListener("DOMContentLoaded",function(){var a=sheets(),held=[],j;for(j=0;j<a.length;j++)if(pending(a[j])){a[j].disabled=true;held.push(a[j])}` +
  `if(held.length)setTimeout(function(){for(var k=0;k<held.length;k++){var x=held[k];x.disabled=false;if(done.has(x)&&!x.sheet)x.replaceWith(x.cloneNode(true))}})});` +
  `function here(){return location.href.split("#")[0]}` +
  // A held link goes only while the page is still the one it was clicked on: a router may have moved on meanwhile.
  `function follow(){if(jump&&(!loading()||Date.now()>=until)){var h=jump;jump=null;if(h.split("#")[0]===here())location.assign(h)}}` +
  `function drop(){jump=null}w.addEventListener("popstate",drop);w.addEventListener("hashchange",drop);` +
  // A stylesheet's load or error comes after Safari counts it in, so the jump goes once nothing is loading.
  `function settle(e){if(e.target&&e.target.localName==="link"){done.add(e.target);setTimeout(follow)}}` +
  `d.addEventListener("load",settle,true);d.addEventListener("error",settle,true);` +
  // After the page's own handlers: a router that takes the click has prevented it. Any later link drops a held one.
  `w.addEventListener("click",function(e){var p=e.composedPath(),a,k,h;for(k=0;k<p.length;k++)if((p[k].localName==="a"||p[k].localName==="area")&&typeof p[k].href==="string"&&p[k].hasAttribute("href")){a=p[k];break}` +
  `if(!a)return;jump=null;if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||(a.target&&a.target!=="_self")||a.hasAttribute("download"))return;` +
  // Any "#", the top of the page ("#") too, since Safari scrolls back there as well.
  `h=a.href;if(h.indexOf("#")<0||h.split("#")[0]!==here()||!loading())return;` +
  `e.preventDefault();jump=h;until=Date.now()+${FRAGMENT_FOCUS_WAIT_MS};setTimeout(follow,${FRAGMENT_FOCUS_WAIT_MS})})})(window,document)`;

/**
 * The inline script that keeps a person's focus where it is on a page whose address names a place on it (`#reviews`).
 * Safari jumps back to that place each time a stylesheet loads, until the person scrolls, once the page finished
 * parsing or a link to a place on it was followed while a stylesheet was still loading: on a slow connection, or with a
 * route's CSS that the app's script adds as the page starts. Each jump takes focus from wherever it was: out of an open
 * menu, or a field mid-word. The script stops it. The parser holds an inline script until the stylesheets above it have
 * loaded; a stylesheet a script added that is still loading as parsing ends is set aside for that moment, then carries
 * on; and a link to a place on the page, clicked while a stylesheet is loading, goes there once it has loaded (two
 * seconds at most), unless the page has moved on. Other browsers don't jump back, so it leaves them alone. Put it first
 * in `<body>`, after every stylesheet, as an inline classic script: not a module, and not `async` or `defer`. Painting
 * waits for those stylesheets anyway, so nothing shows later. It is plain text, so a Server Component can render it.
 * Use nothing instead on a page with no stylesheet.
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
 * @claim "The script stops it" site/e2e/fragment-focus.spec.ts verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, on a page opened at a place while its stylesheet loads)
 * @claim "The script stops it" site/e2e/fragment-focus.spec.ts verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, after a link to a place on the page is followed while a stylesheet loads, and still goes there)
 * @claim "The script stops it" site/e2e/fragment-focus.spec.ts verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, after a stylesheet the page's script added was still loading as parsing ended)
 * @claim "unless the page has moved on" registry/ouro/lib/ouro/fragment-focus-script.test.ts verify:testExists(registry/ouro/lib/ouro/fragment-focus-script.test.ts::fragmentFocusScript in WebKit > drops a held link once the page moves on, or another link is clicked)
 * @claim "Other browsers don't jump back, so it leaves them alone" registry/ouro/lib/ouro/fragment-focus-script.test.ts verify:testExists(registry/ouro/lib/ouro/fragment-focus-script.test.ts::fragmentFocusScript outside WebKit > holds no link)
 * @claim "two seconds at most" site/e2e/fragment-focus.spec.ts verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > follows a link to a place on the page after two seconds when a stylesheet is still loading)
 */
function fragmentFocusScript(): string {
  return script;
}
