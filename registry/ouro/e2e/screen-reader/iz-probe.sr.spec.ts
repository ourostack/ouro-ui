import { execFileSync } from "node:child_process";
import { test } from "@playwright/test";

const sh = (cmd: string) => {
  try {
    return execFileSync("/bin/bash", ["-c", cmd], { encoding: "utf8", timeout: 20_000 }).trim();
  } catch (error) {
    return `ERR ${(error as Error).message.split("\n")[0]}`;
  }
};
export async function sample(after: string) {
  for (let second = 0; second <= 30; second += 2) {
    const procs = sh("ps -axo pid,etime,comm | grep -i -E 'voiceover|speech|screenreader|accessib|VoiceOver|AXVisual|universalaccess|TTS|synth' | grep -v grep | awk '{print $1\":\"$2\":\"$NF}' | sed 's#.*/##' | tr '\\n' ' '");
    console.log(`[probe] ${after} +${second}s: ${procs}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
test("probe: processes after item", async () => {
  test.setTimeout(120_000);
  await sample("after item");
});
