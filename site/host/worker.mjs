/* global URL, Headers, Response, fetch */
// ouro-ui-host: serves the site at https://ui.ouroboros.bot/ (Ari, 2026-11-07: "move every surface
// to ouroboros.bot"). GitHub Pages builds and holds the site (pages.yml) at
// https://ourostack.github.io/ouro-ui/; this Worker, on the route ui.ouroboros.bot/*, fetches each
// request from there and keeps every address on ui.ouroboros.bot. The old host, ui.ouro.bot, 301s
// here from ourostack/ouro-apps-site's ouro-apex Worker. site/host/worker.test.mjs is the contract.

export const host = "https://ui.ouroboros.bot";
export const pages = "https://ourostack.github.io/ouro-ui";

/** The Pages address that holds `path` on ui.ouroboros.bot. */
export function upstream(url) {
  return `${pages}${url.pathname}${url.search}`;
}

/** A redirect Pages sends (a folder without its slash) points back at ui.ouroboros.bot. */
export function rehome(location) {
  if (!location) return location;
  const prefix = new URL(pages).pathname; // "/ouro-ui"
  const target = new URL(location, `${pages}/`);
  if (target.origin !== new URL(pages).origin) return location;
  const path = target.pathname === prefix ? "/" : target.pathname.startsWith(`${prefix}/`) ? target.pathname.slice(prefix.length) : target.pathname;
  return `${host}${path}${target.search}${target.hash}`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const forwarded = new Headers(request.headers);
    forwarded.delete("host"); // Pages finds the site by its own host name
    const response = await fetch(upstream(url), {
      method: request.method,
      headers: forwarded,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
    const headers = new Headers(response.headers);
    if (headers.has("location")) headers.set("location", rehome(headers.get("location")));
    headers.set("x-ouro-ui-host", "ui.ouroboros.bot");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
