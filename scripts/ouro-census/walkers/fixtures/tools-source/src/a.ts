// A passthrough's declared source: a call whose argument, or the list it maps, must trace back to it (#3279).
export function mcpFromTool(tool: { name: string }) {
  return { type: "function" as const, function: { name: tool.name, description: "forwarded from tool" } };
}

// Direct call, traced: the parameter named exactly like the declared source.
export function viaServerTools(serverTools: { name: string }) {
  return mcpFromTool(serverTools);
}

// Direct call, not traced: a different parameter -- the harness's own tool, not the declared source.
export function viaHostTool(hostTool: { name: string }) {
  return mcpFromTool(hostTool);
}

// Value usage, traced: the harness's own tool list, correctly read from the declared source, mapped through it.
export function serverToolList(serverTools: { name: string }[]) {
  return serverTools.map(mcpFromTool);
}

// Value usage, not traced: the harness's OWN tool list mapped through the passthrough -- the bug reported in #3279.
export function hostToolList(ownTools: { name: string }[]) {
  return ownTools.map(mcpFromTool);
}

// Value usage, traced through a local alias of the declared source.
export function viaLocalAlias(serverTools: { name: string }[]) {
  const list = serverTools;
  return list.map(mcpFromTool);
}

// Value usage, traced through a for-of loop over the declared source.
export function viaForOf(serverTools: { name: string }[]) {
  const out: unknown[] = [];
  for (const tool of serverTools) out.push(mcpFromTool(tool));
  return out;
}

// Value usage, not traced: a literal list.
export const fromLiteralList = [{ name: "literal_tool" }].map(mcpFromTool);

// mcpFromBody: a second passthrough, traced via a dotted property chain (the request body's tools).
export function mcpFromBody(tool: { name: string }) {
  return { type: "function" as const, function: { name: tool.name, description: "forwarded from body" } };
}

export function fromRequestBody(req: { body: { tools: { name: string }[] } }) {
  return req.body.tools.map(mcpFromBody);
}

export function fromWrongBody(req: { other: { tools: { name: string }[] } }) {
  return req.other.tools.map(mcpFromBody);
}

// mcpFromServerCall: a third passthrough, traced via a call to the declared source function.
export function mcpFromServerCall(tool: { name: string }) {
  return { type: "function" as const, function: { name: tool.name, description: "forwarded from server call" } };
}

declare function listTools(): { name: string }[];
declare function otherTools(): { name: string }[];

export function fromConnectedServer() {
  return listTools().map(mcpFromServerCall);
}

export function fromOtherServer() {
  return otherTools().map(mcpFromServerCall);
}

// Value usage, traced through a module-scope const the declared source names directly (no parameter, no call).
declare const SERVER_TOOLS: { name: string }[];
declare const OTHER_TOOLS: { name: string }[];

// mcpFromConst: a fourth passthrough, traced via a module-scope const read directly (not a parameter or a call).
export function mcpFromConst(tool: { name: string }) {
  return { type: "function" as const, function: { name: tool.name, description: "forwarded from const" } };
}

export function fromModuleConst() {
  return SERVER_TOOLS.map(mcpFromConst);
}

export function fromOtherModuleConst() {
  return OTHER_TOOLS.map(mcpFromConst);
}
