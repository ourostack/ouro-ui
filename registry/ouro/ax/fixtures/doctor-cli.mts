// A tool built from the kit whose one read is a doctor (ax-checks), for the X-ray's tests: `node fixtures/doctor-cli.mts <args>`.
// DOCTOR_BROKEN=1 makes its cache check fail, so the doctor exits with the tool's not-ready code; DOCTOR_TEXT_EXIT=1
// makes its text exit 1 whatever the report says, a text that disagrees with its JSON; DOCTOR_SHARED=1 passes the share check.
import { defineChecks } from "../checks.ts";
import { quietPipes, runCli } from "../cli.ts";
import { defineCli, defineCommand } from "../command.ts";
import { BASE_EXIT_CODES, defineExitCodes } from "../exit-codes.ts";

const exits = defineExitCodes([...BASE_EXIT_CODES, { code: 3, name: "not-ready", short: "not ready", meaning: "a check failed; its fix says what to do" }]);
const broken = process.env["DOCTOR_BROKEN"] === "1";

const doctor = defineChecks<null>({
  command: "kit doctor",
  failCode: exits.code("not-ready"),
  checks: [
    { id: "config", label: "Read the config", run: () => ({ state: "passed", detail: "kit.json" }) },
    {
      id: "cache",
      label: "Cache freshness",
      needs: ["config"],
      run: () => (broken ? { state: "failed", detail: "the cache is 3 days old", fix: { byHand: "Delete kit.cache; the next run rebuilds it." } } : { state: "passed" }),
    },
    {
      id: "share",
      label: "Share with a colleague",
      run: () =>
        process.env["DOCTOR_SHARED"] === "1"
          ? { state: "passed" }
          : { state: "skipped", detail: "it reaches another person, so the doctor leaves it to you", kind: "by hand", fix: { byHand: "Share a note with a colleague and ask them whether it arrived." } },
    },
  ],
});

const kit = defineCli({
  name: "kit",
  about: ["kit: a doctor built from Ouro AX definitions."],
  exits,
  voice: { healthy: ["All clear. Go make something."] },
  commands: [
    defineCommand({
      name: "doctor",
      summary: "Checks the kit is ready to use.",
      effect: "private",
      readOnly: true,
      flags: { verbose: { type: "boolean", description: "Show the passing checks too." } },
      output: "{ ax, verdict, summary, durationMs, counts, rows, next, exitCode }",
      examples: ["kit doctor --verbose"],
      run: (input) => doctor.run(null, { progress: process.stderr, env: process.env, off: input["json"] === true }),
    }),
  ],
});

quietPipes(process);
const argv = process.argv.slice(2);
process.exitCode = await runCli(kit, argv, { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin });
if (process.env["DOCTOR_TEXT_EXIT"] && !argv.includes("--json")) process.exitCode = Number(process.env["DOCTOR_TEXT_EXIT"]);
