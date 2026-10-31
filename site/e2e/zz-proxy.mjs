// PROBE (never merged): a logging pass-through proxy in front of vite preview (4180 -> 4179).
import http from "node:http";
import { appendFileSync } from "node:fs";
let n = 0;
const agent = new http.Agent({ keepAlive: true });
http.createServer((req, res) => {
  const id = ++n;
  const up = http.request({ host: "127.0.0.1", port: 4179, path: req.url, method: req.method, headers: req.headers, agent }, (r) => {
    let first = null;
    let bytes = 0;
    r.on("data", (chunk) => { if (first === null) first = chunk.subarray(0, 2).toString("hex"); bytes += chunk.length; });
    r.on("end", () => {
      const bad = first === "1f8b" && !r.headers["content-encoding"];
      appendFileSync("proxy-log.txt", `${bad ? "BAD " : ""}${id} ${Date.now()} ${req.method} ${req.url} -> ${r.statusCode} enc=${r.headers["content-encoding"]} len=${r.headers["content-length"]} te=${r.headers["transfer-encoding"]} type=${r.headers["content-type"]} first=${first} bytes=${bytes} | ae=${req.headers["accept-encoding"]} inm=${req.headers["if-none-match"]} conn=${req.headers["connection"]}\n`);
    });
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => { res.statusCode = 502; res.end(String(e)); });
  req.pipe(up);
}).listen(4180, "127.0.0.1");
