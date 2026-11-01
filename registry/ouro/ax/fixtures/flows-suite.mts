// A suite of agent flows over the kit's example tool, for flows.test.mts and as the pattern to copy: the tool runs in
// this process, a loopback mock serves its rooms as an API and takes a made-up reply on its control port, and the guard
// proves the mock is the toy before any flow runs.
import { createServer } from "node:http";
import { runCli } from "../cli.ts";
import { exampleCli, postMessage, resetRooms, rooms } from "../example-cli.ts";
import { defineFlow, defineSuite, inProcess, type Mock } from "../flows.ts";

const ERR = ["oneLine", "namesFix", "noStack"] as const;

export const flows = [
  defineFlow({
    id: "H1",
    surface: "agent-cli",
    title: "Find the door: the overview and help as data",
    rubric: ["discoverable", "predictable", "fast"],
    readOnly: true,
    steps: [
      { id: "help", run: ["--help"], expect: { exit: 0, stderrRules: ["empty"], maxBytes: 2000, text: { has: ["^Only you see these", "^Other people see these"] } } },
      { id: "help-json", run: ["help", "--json"], expect: { exit: 0, jsonShape: ["commands[].name", "commands[].effect", "exitCodes[].code"], fields: { tool: "notes" } } },
    ],
  }),
  defineFlow({
    id: "T3",
    surface: "agent-cli",
    title: "Post what someone asked for, after a preview",
    source: "core task T3",
    rubric: ["predictable", "honest", "forgiving"],
    env: { NOTES_AGENT: "flow-review" },
    steps: [
      { id: "rooms", run: ["rooms", "--json"], expect: { exit: 0, jsonShape: ["[].ref"], fields: { "[0].title": "Design sync" } }, save: { room: "[0].ref" } },
      { id: "no-why", run: ["post", "{room}", "Running late"], expect: { exit: 2, stderrRules: [...ERR], text: { has: ["--why"] } } },
      { id: "preview", run: ["post", "{room}", "Running late", "--why", "Jo asked", "--dry-run", "--json"], expect: { exit: 0, fields: { state: "planned", "audience.who": { re: "^everyone in" } } } },
      { id: "post", run: ["post", "{room}", "Running late", "--why", "Jo asked", "--json"], expect: { exit: 0, fields: { state: "done", "receipt.why": "Jo asked", "next[].command": { re: "watch" } }, maxMs: 5000 } },
    ],
  }),
  defineFlow({
    id: "T5",
    surface: "agent-cli",
    title: "Wait for a reply, from a cursor, while one arrives",
    rubric: ["predictable", "fast"],
    steps: [
      { id: "cursor", run: ["watch", "abc123", "--timeout", "1ms", "--json"], expect: { exit: [0, 1], jsonShape: ["cursor"] }, save: { cursor: "cursor" } },
      { id: "reply", harness: { path: "/inject", body: { room: "abc123", by: "Jo Park", text: "On my way" } } },
      { id: "wait", run: ["watch", "abc123", "--cursor", "{cursor}", "--timeout", "2s", "--json"], expect: { exit: 0, fields: { state: "satisfied", "events[].summary": "On my way", "events[].by": "Jo Park" } } },
    ],
  }),
  defineFlow({
    id: "A1",
    surface: "agent-http",
    title: "The rooms over HTTP",
    rubric: ["predictable"],
    steps: [{ id: "rooms", request: { method: "GET", path: "/api/rooms" }, expect: { exit: 200, jsonShape: ["rooms[].ref"] } }],
  }),
  defineFlow({
    id: "K1",
    surface: "agent-cli",
    title: "A known defect: the rooms text has no member count yet",
    rubric: ["beautiful", "discoverable"],
    readOnly: true,
    known: { "discoverable.listed": "https://example.com/issues/4" },
    steps: [
      { id: "rooms-text", run: ["rooms"], expect: { exit: 0, text: { has: ["members"] } }, known: "https://example.com/issues/1" },
      { id: "secret", run: ["secret"], expect: { exit: [0, 2] } },
    ],
  }),
  defineFlow({
    id: "K2",
    surface: "agent-cli",
    title: "A known defect that is fixed: its mark should go",
    rubric: ["predictable"],
    steps: [{ id: "rooms", run: ["rooms"], expect: { exit: 0 }, known: "https://example.com/issues/2" }],
  }),
  defineFlow({
    id: "U1",
    surface: "agent-cli",
    title: "Unknown failures: a wrong exit code, and a flow said to only read that writes",
    rubric: ["predictable", "honest"],
    readOnly: true,
    steps: [
      { id: "rooms", run: ["rooms"], expect: { exit: 3 }, fix: "nothing: this flow fails on purpose" },
      { id: "fields", run: ["rooms", "--json"], expect: { exit: 0, fields: { "[0].owner": "Jo" } } },
      { id: "note", run: ["note", "abc123", "a private note"], expect: { exit: 0 } },
    ],
  }),
  defineFlow({
    id: "U2",
    surface: "agent-cli",
    title: "One unknown failure",
    rubric: ["predictable"],
    steps: [{ id: "exit", run: ["rooms"], expect: { exit: 4 } }],
  }),
];

export default defineSuite({
  tool: "notes",
  flows,
  // The tool in this process; `state` is the toy's whole state, for reads-stay-reads.
  cli: inProcess((argv, io) => (argv[0] === "state" ? (io.stdout.write(`${JSON.stringify(rooms)}\n`), 0) : runCli(exampleCli, argv, io, { env: io.env }))),
  state: ["state"],
  brandNames: ["Captain", "Stoker"],
  async start(): Promise<Mock> {
    resetRooms();
    const server = createServer((req, res) => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.url === "/" || req.url === "/api/rooms") return send(200, req.url === "/" ? { mock: true } : { rooms: Object.entries(rooms).map(([ref, r]) => ({ ref, title: r.title })) });
      if (req.url === "/inject" && req.method === "POST") {
        let body = "";
        req.on("data", (d: Buffer) => (body += String(d)));
        req.on("end", () => {
          const b = JSON.parse(body) as { room: string; by: string; text: string };
          postMessage(b.room, b.by, b.text);
          send(200, { ok: true });
        });
        return;
      }
      send(404, { error: "no such route" });
    });
    const url = await new Promise<string>((done) => server.listen(0, "127.0.0.1", () => done(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
    return { url, control: url, vars: { room: "abc123" }, stop: () => new Promise<void>((done) => server.close(() => done())) };
  },
  async guard(mock) {
    const answer = (await (await fetch(`${mock.url}/`)).json()) as { mock?: boolean };
    if (answer.mock !== true || !rooms["abc123"]) throw new Error("not the toy's mock. Fix: start the suite's own mock.");
  },
});
