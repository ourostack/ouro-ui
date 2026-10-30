#!/usr/bin/env node
// Writes the routes manifest ax-xray checks Tandem's agent port against, from the route table Tandem declares
// (src/model/protocol.ts, `interface Routes`). It reads the declaration as text; it runs none of Tandem's code.
//   node ax/manifests/tandem-routes.mjs <tandem checkout> > ax/manifests/tandem.json
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: node ax/manifests/tandem-routes.mjs <tandem checkout>");
  process.exit(2);
}
const src = fs.readFileSync(path.join(root, "src/model/protocol.ts"), "utf8");
const body = src.slice(src.indexOf("export interface Routes {"), src.indexOf("export type RouteKey"));
const routes = [...body.matchAll(/^\s+"((?:GET|POST|PUT) \/api\/[^"]*)":/gm)].map((m) => m[1]);
const manifest = {
  $comment: "Tandem's agent-port routes, from src/model/protocol.ts. state: what reads must not change. others: refused probes of what other people see (a made-up target; ax-xray sends each without, then with, its why).",
  base: "/api",
  routes,
  // The page's own work queues and sync routes answer only Tandem's window; ax-xray still checks their refusals.
  skip: [],
  state: ["GET /api/log", "GET /api/drafts"],
  others: [
    { route: "POST /api/agent-actions", why: "why", body: { action: "message.send", conversationId: "{ref}", text: "ax-xray probe", agent: "ax-xray" } },
    { route: "POST /api/agent-actions", why: "why", body: { action: "reaction.add", conversationId: "{ref}", messageId: "{ref}", key: "like", agent: "ax-xray" } },
    { route: "POST /api/agent-actions", why: "why", body: { action: "conversation.markRead", conversationId: "{ref}", agent: "ax-xray" } },
    { route: "POST /api/agent-actions", why: "why", body: { action: "meeting.respond", meetingId: "{ref}", response: "accepted", agent: "ax-xray" } },
    { route: "POST /api/meetings/{id}/join", why: "why", body: { agent: "ax-xray" } },
  ],
};
process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
