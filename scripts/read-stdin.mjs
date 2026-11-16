// Reads standard input asynchronously. A synchronous read of a pipe that returns short reads overflows the heap on Node 24 and 26.8+ (nodejs/node#66341).
import { Buffer } from "node:buffer";

export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
