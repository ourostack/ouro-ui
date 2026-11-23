// Built stand-in for a bundle MCP server that serves a tool with no name and get_shopping_list twice.
const tool = (name) => ({ name, description: "", inputSchema: { type: "object", properties: {} } });
exports.getToolSchemas = () => [tool("get_shopping_list"), tool(""), tool("get_shopping_list"), tool("add_shopping_list_item"), tool("remove_shopping_list_item"), tool("share_shopping_list")];
