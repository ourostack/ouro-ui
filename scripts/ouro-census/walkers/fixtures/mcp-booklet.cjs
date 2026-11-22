// Built stand-in for mcp-booklet.ts.
exports.serverErrors = [{ code: "unknown-door", means: "No tool has that name.", fix: "Call the tool the message names." }];
exports.getToolSchemas = () => [
  {
    name: "ask",
    description: "Ask the agent a question. Always ask before guessing.",
    inputSchema: { type: "object", properties: {} },
    ax: {
      id: "mcp:ask",
      group: "agent",
      when: "Get one answer from the agent, which may research it with its own tools first.",
      effect: "write",
      errors: [{ code: "daemon-down", means: "The daemon isn't running.", fix: "Run ouro up, then ask again." }],
    },
  },
];
