// The kit's example tool served as MCP tools over stdio (mcp.ts), for the X-ray's tests: `node fixtures/notes-mcp.mts`.
import { exampleCli } from "../example-cli.ts";
import { serveMcp } from "../mcp.ts";

await serveMcp({ cli: exampleCli, version: "1.0.0", input: process.stdin, output: process.stdout });
