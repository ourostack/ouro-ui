// Serves the built site (site/dist) the way GitHub Pages does, for Lighthouse and the site's
// end-to-end specs (playwright.config.ts): over HTTP/2 and
// TLS, gzipped, at /, with Pages' cache headers for hashed assets. Lighthouse's
// simulated throttling models a page's requests by protocol, and over vite preview's HTTP/1.1 it
// charges a round trip per six requests that Pages, on HTTP/2, never pays.
//
//   node site/scripts/serve-pages.mjs [port]     (default 4180; a self-signed certificate is
//                                                  made in .tmp/pages-cert on first use)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createSecureServer } from "node:http2";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { gzipSync } from "node:zlib";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const dist = join(repo, "site/dist");
const certDir = join(repo, ".tmp/pages-cert");
const port = Number(process.argv[2] ?? 4180);
const base = "/";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
};

if (!existsSync(join(certDir, "cert.pem"))) {
  mkdirSync(certDir, { recursive: true });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=127.0.0.1", "-keyout", join(certDir, "key.pem"), "-out", join(certDir, "cert.pem")], { stdio: "ignore" });
}

function resolveFile(pathname) {
  if (!pathname.startsWith(base)) return undefined;
  const relative = normalize(decodeURIComponent(pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [join(dist, relative), join(dist, relative, "index.html")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

// PROBE: bodies (and their gzip) made once, before listening, when PROBE_CACHED is set.
const cache = new Map();
if (process.env["PROBE_CACHED"]) {
  const { readdirSync } = await import("node:fs");
  const started = Date.now();
  for (const entry of readdirSync(dist, { recursive: true })) {
    const file = join(dist, String(entry));
    if (!statSync(file).isFile()) continue;
    const body = readFileSync(file);
    const type = types[extname(file)] ?? "application/octet-stream";
    cache.set(file, { body, gzip: /text|json|svg|xml/.test(type) ? gzipSync(body) : undefined });
  }
  console.log(`PROBE cached ${cache.size} files in ${Date.now() - started} ms`);
}

const server = createSecureServer({ key: readFileSync(join(certDir, "key.pem")), cert: readFileSync(join(certDir, "cert.pem")), allowHTTP1: true }, (request, response) => {
  const url = new URL(request.url, "https://localhost");
  if (url.pathname === base.slice(0, -1)) {
    response.writeHead(301, { location: base });
    return response.end();
  }
  const file = resolveFile(url.pathname);
  const cached = cache.get(file ?? join(dist, "404.html"));
  const body = cached?.body ?? (file ? readFileSync(file) : readFileSync(join(dist, "404.html")));
  const type = types[extname(file ?? ".html")] ?? "application/octet-stream";
  const headers = { "content-type": type, "cache-control": file && url.pathname.includes("/assets/") ? "max-age=31536000, immutable" : "max-age=600" };
  const compress = /text|json|svg|xml/.test(type) && /\bgzip\b/.test(String(request.headers["accept-encoding"] ?? ""));
  response.writeHead(file ? 200 : 404, compress ? { ...headers, "content-encoding": "gzip", vary: "accept-encoding" } : headers);
  response.end(compress ? (cached?.gzip ?? gzipSync(body)) : body);
});

server.listen(port, "127.0.0.1", () => console.log(`Serving site/dist over HTTP/2 at https://127.0.0.1:${port}${base}`));
