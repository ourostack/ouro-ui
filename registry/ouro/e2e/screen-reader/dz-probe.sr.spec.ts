import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { test } from "@playwright/test";

const sh = (cmd: string) => {
  try {
    return execFileSync("/bin/bash", ["-c", cmd], { encoding: "utf8", timeout: 20_000 }).trim();
  } catch (error) {
    return `ERR ${(error as Error).message.split("\n")[0]}`;
  }
};
test("probe: state after dialog", async () => {
  test.setTimeout(120_000);
  const wait = Number(process.env["PROBE_WAIT"] ?? 0);
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  writeFileSync("/tmp/vo-after.txt", sh("defaults read com.apple.VoiceOver4/default 2>&1"));
  console.log(`[probe] after (waited ${wait} ms): front=${sh(`osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`)}`);
  console.log(`[probe] after: procs=${sh("pgrep -fl 'Playwright|MiniBrowser|WebKit.WebContent' | wc -l")}`);
  console.log(`[probe] after: plist ps=${sh("pgrep -fl 'Playwright|MiniBrowser|WebKit.WebContent' | cut -c1-120")}`);
  console.log(`[probe] VoiceOver prefs diff:\n${sh("diff /tmp/vo-before.txt /tmp/vo-after.txt | head -60")}`);
  console.log(`[probe] VoiceOver running: ${sh("pgrep -x VoiceOver || echo no")}`);
});
