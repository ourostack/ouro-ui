// Built stand-in for a bundle MCP server: the four tools tools.json declares, and clear_shopping_list, which it doesn't.
const tool = (name, description) => ({ name, description, inputSchema: { type: "object", properties: {} } });
const schemas = [
  tool("get_shopping_list", "List the items."),
  tool("add_shopping_list_item", "Add an item."),
  tool("remove_shopping_list_item", "Remove an item."),
  tool("share_shopping_list", "Share the list."),
  tool("clear_shopping_list", "Take every item off the list."),
];
exports.getToolSchemas = () => schemas;
exports.listTools = () => schemas.map((s) => ({ ...s, annotations: { readOnlyHint: s.name === "get_shopping_list" } }));
