// Serves the built site at /ouro-ui/ and the install proof's per-preset builds at /app/<preset>/,
// for site/theme-install (its playwright.config.ts starts it).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { URL } from "node:url";

const roots = { "/ouro-ui/": join(import.meta.dirname, "../dist"), "/app/": process.env.THEME_APP };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".txt": "text/plain" };

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const prefix = Object.keys(roots).find((candidate) => path.startsWith(candidate));
  if (!prefix || !roots[prefix]) return void response.writeHead(404).end();
  let file = normalize(join(roots[prefix], path.slice(prefix.length)));
  if (!file.startsWith(roots[prefix])) return void response.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return void response.writeHead(404).end();
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" });
  createReadStream(file).pipe(response);
}).listen(Number(process.env.PORT ?? 4190), "127.0.0.1");
