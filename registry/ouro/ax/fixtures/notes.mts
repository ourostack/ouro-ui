// The kit's example tool (example-cli.ts) as a program, for the X-ray's tests: `node fixtures/notes.mts <args>`.
// State lives in $NOTES_STATE (a JSON file), so the X-ray's state snapshots can see what changed between calls.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { quietPipes, runCli } from "../cli.ts";
import { exampleCli, rooms } from "../example-cli.ts";

const file = process.env["NOTES_STATE"];
if (file && existsSync(file)) Object.assign(rooms, JSON.parse(readFileSync(file, "utf8")));
const argv = process.argv.slice(2);
if (argv[0] === "state") {
  process.stdout.write(`${JSON.stringify(rooms)}\n`);
} else {
  quietPipes(process);
  process.exitCode = await runCli(exampleCli, argv, { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin });
  if (file) writeFileSync(file, JSON.stringify(rooms));
}
