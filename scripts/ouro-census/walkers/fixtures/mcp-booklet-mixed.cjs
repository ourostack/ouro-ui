// Built stand-in for mcp-booklet-mixed.ts.
const errors = [{ code: "daemon-down", means: "The daemon isn't running.", fix: "Run ouro up, then ask again." }];
exports.serverErrors = [{ code: "unknown-door", means: "No tool has that name.", fix: "Call the tool the message names." }];
exports.getToolSchemas = () => [
  {
    name: "ask",
    description: "Ask the agent a question. Always ask before guessing.",
    inputSchema: { type: "object", properties: {} },
    ax: { id: "mcp:ask", group: "agent", when: "Get one answer from the agent, which may research it with its own tools first.", effect: "write", errors },
  },
  {
    name: "status",
    description: "Read the agent's status. Never guess it.",
    inputSchema: { type: "object", properties: {} },
    ax: { id: "mcp:status", group: "agent", when: "See whether the agent is running and what it is working on.", effect: "sometimes", errors },
  },
];
