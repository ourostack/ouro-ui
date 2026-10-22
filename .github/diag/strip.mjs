// Diagnostic only: strips parts of the built voyage HTML, to see what its size does to LCP.
import { readFileSync, writeFileSync } from "node:fs";
const file = "site/dist/voyage/index.html";
let html = readFileSync(file, "utf8");
const how = process.argv[2];
if (how === "nolabels") html = html.replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/g, "");
if (how === "pad1k") html = html.replace("</body>", `<div hidden>${Array.from({ length: 400 }, (_, i) => Math.random().toString(36).slice(2, 6)).join(" ")}</div></body>`);
if (how === "noagents") html = html.replace(/<section[^>]*id="agents"[\s\S]*?<\/section>/, "");
writeFileSync(file, html);
console.log(`${how}: ${html.length}`);
