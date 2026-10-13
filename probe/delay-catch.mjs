import { readFileSync, writeFileSync } from "node:fs";

const path = "registry/ouro/components/ouro/swipe-actions/swipe-actions.touch.test.tsx";
const source = readFileSync(path, "utf8");
const anchor = 'await commands.touchStep({ type: "touchStart", x, y });\n        for (const dx of [12, 20])';
if (!source.includes(anchor)) throw new Error("Spring-catch command-stall anchor is missing");
writeFileSync(path, `const probeWallTimer = window.setTimeout.bind(window);\n${source.replace(anchor, 'await commands.touchStep({ type: "touchStart", x, y });\n        await new Promise<void>((resolve) => probeWallTimer(resolve, 600));\n        for (const dx of [12, 20])')}`);
