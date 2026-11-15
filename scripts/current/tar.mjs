// Reads the files of a gzipped tar (a GitHub tarball) into a Map of path to bytes. GitHub's tarballs put every path
// under one top folder (`<owner>-<repo>-<sha>/`), which is dropped. Long names arrive in pax (`x`) or GNU (`L`) records.
import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";

const text = (bytes) => bytes.toString("utf8").replace(/\0.*$/s, "");

export function readTarball(gzipped) {
  const data = gunzipSync(gzipped);
  const files = new Map();
  let offset = 0;
  let longName = null;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(text(header.subarray(124, 136)).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = text(header.subarray(345, 500));
    const body = data.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x" || type === "g") {
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"));
      if (type === "x" && path) longName = path[1];
      continue;
    }
    if (type === "L") {
      longName = text(body);
      continue;
    }
    const name = longName ?? (prefix ? `${prefix}/${text(header.subarray(0, 100))}` : text(header.subarray(0, 100)));
    longName = null;
    if (type !== "0") continue;
    files.set(name.replace(/^[^/]+\//, ""), Buffer.from(body));
  }
  return files;
}
