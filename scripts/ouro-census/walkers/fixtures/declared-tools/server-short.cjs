// Built stand-in for a bundle MCP server that serves three of the four tools tools.json declares.
const tool = (name) => ({ name, description: "", inputSchema: { type: "object", properties: {} } });
exports.getToolSchemas = () => [tool("get_shopping_list"), tool("add_shopping_list_item"), tool("remove_shopping_list_item")];
