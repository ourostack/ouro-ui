// PROBE (never merged): a pass-through proxy in front of vite preview (4180 -> 4179).
// PROBE_MODE=identity: asks preview for no compression. PROBE_MODE=buffered: sends preview's gzip
// whole, with Content-Length, not chunked.
import http from "node:http";
const mode = process.env["PROBE_MODE"];
const agent = new http.Agent({ keepAlive: true });
http.createServer((req, res) => {
  const headers = { ...req.headers };
  if (mode === "identity") delete headers["accept-encoding"];
  const up = http.request({ host: "127.0.0.1", port: 4179, path: req.url, method: req.method, headers, agent }, (r) => {
    if (mode === "buffered") {
      const chunks = [];
      r.on("data", (chunk) => chunks.push(chunk));
      r.on("end", () => {
        const body = Buffer.concat(chunks);
        const out = { ...r.headers };
        delete out["transfer-encoding"];
        if (r.statusCode !== 304) out["content-length"] = String(body.length);
        res.writeHead(r.statusCode, out);
        res.end(body);
      });
      return;
    }
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => { res.statusCode = 502; res.end(String(e)); });
  req.pipe(up);
}).listen(4180, "127.0.0.1");
