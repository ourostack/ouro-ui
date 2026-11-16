// A CLI whose file name is not its tool's name: its help JSON says what it is called. $TOOL_MODE picks its answer to
// `help --json`: "named" (its tool name), "unnamed" (JSON with no tool), "text" (not JSON) or "broken" (exits 2).
const mode = process.env.TOOL_MODE ?? "named";

if (process.argv[2] === "help" && process.argv[3] === "--json") {
  if (mode === "broken") {
    process.stderr.write("tracker: help is broken\n");
    process.exit(2);
  }
  if (mode === "text") {
    process.stdout.write("tracker: the help is text\n");
    process.exit(0);
  }
  process.stdout.write(JSON.stringify(mode === "named" ? { tool: "tracker", commands: [] } : { commands: [] }));
  process.exit(0);
}
process.stderr.write("tracker: there is no such command. Fix: tracker help --json\n");
process.exit(2);
