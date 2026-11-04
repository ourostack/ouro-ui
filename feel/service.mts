// Ouro Feel's probe service: serves a page with the probe first in its <head>, and drives it by
// long-poll, so the runner needs nothing from whatever opened the page (a browser it launched, a
// bare WKWebView, or an app's own shipped web view).
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import type { RunResult } from "./probe/probe.ts";

/** Where the service answers the probe: `<page>/ouro-feel/`. */
export const BRIDGE = "/ouro-feel/";

const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

type Command = { type: "run"; case: string } | { type: "title"; title: string };
type Reply = { ok: true; result?: RunResult } | { ok: false; error: string };

/** How long a poll waits for a command before it answers 204 and the page asks again. */
const POLL_MS = 20_000;

export interface ProbeService {
  /** The page's address. */
  url: string;
  /** Resolves with the page's user agent once a page with the probe has loaded. */
  hello(): Promise<{ userAgent: string }>;
  /** Sends a command to the page and resolves with its reply. */
  send(command: Command): Promise<Reply>;
  close(): void;
}

function body(request: IncomingMessage): Promise<unknown> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => done(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")));
    request.on("error", fail);
  });
}

/** Serves `root` on 127.0.0.1, with the probe at `probe` injected first in every HTML page's <head>. */
export function serveWithProbe(root: string, probe: string): Promise<ProbeService> {
  const base = resolve(root);
  const tag = `<script src="${BRIDGE}probe.js" data-ouro-feel-bridge="${BRIDGE}"></script>`;
  let nextId = 1;
  const queue: (Command & { id: number })[] = [];
  const waiting: ServerResponse[] = [];
  const replies = new Map<number, (reply: Reply) => void>();
  let hellos: ((hello: { userAgent: string }) => void)[] = [];

  function deliver(): void {
    while (queue.length > 0 && waiting.length > 0) {
      const response = waiting.shift()!;
      if (response.writableEnded) continue;
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(queue.shift()));
    }
  }

  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path === `${BRIDGE}probe.js`) {
      response.writeHead(200, { "content-type": types[".js"]!, "cache-control": "no-store" }).end(readFileSync(probe));
      return;
    }
    if (path === `${BRIDGE}hello` && request.method === "POST") {
      void body(request).then((hello) => {
        for (const resolveHello of hellos.splice(0)) resolveHello(hello as { userAgent: string });
        response.writeHead(204).end();
      });
      return;
    }
    if (path === `${BRIDGE}next`) {
      waiting.push(response);
      const timer = setTimeout(() => {
        if (!response.writableEnded) response.writeHead(204).end();
      }, POLL_MS);
      response.on("close", () => clearTimeout(timer));
      deliver();
      return;
    }
    if (path === `${BRIDGE}result` && request.method === "POST") {
      void body(request).then((reply) => {
        const { id, ...rest } = reply as { id: number } & Reply;
        replies.get(id)?.(rest as Reply);
        replies.delete(id);
        response.writeHead(204).end();
      });
      return;
    }
    let file = join(base, path);
    if (file.startsWith(base) && existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(base) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const type = types[extname(file)] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    if (extname(file) === ".html") response.end(readFileSync(file, "utf8").replace(/<head>/i, `<head>${tag}`));
    else createReadStream(file).pipe(response);
  });

  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      done({
        url: `http://127.0.0.1:${port}/`,
        hello: () => new Promise((resolveHello) => hellos.push(resolveHello)),
        send(command) {
          const id = nextId++;
          queue.push({ id, ...command });
          deliver();
          return new Promise((resolveReply) => replies.set(id, resolveReply));
        },
        close() {
          for (const response of waiting) if (!response.writableEnded) response.writeHead(204).end();
          hellos = [];
          server.closeAllConnections();
          server.close();
        },
      });
    }),
  );
}
