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
test("probe: state before dialog", () => {
  writeFileSync("/tmp/vo-before.txt", sh("defaults read com.apple.VoiceOver4/default 2>&1"));
  console.log(`[probe] before: front=${sh(`osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`)}`);
  console.log(`[probe] before: procs=${sh("pgrep -fl 'Playwright|MiniBrowser|WebKit.WebContent' | wc -l")}`);
});
