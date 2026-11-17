// A tool built from the kit whose commands share a first word with no group summary, for the X-ray's tests:
// `node fixtures/peer-cli.mts <args>`. Its overview lists "peer inbox" and "peer send" by their whole names.
import { quietPipes, runCli } from "../cli.ts";
import { defineCli, defineCommand } from "../command.ts";

const tool = defineCli({
  name: "pal",
  about: ["pal: talks to a peer, built from Ouro AX definitions."],
  commands: [
    defineCommand({
      name: "peer inbox",
      summary: "Read the peer's new messages, oldest first.",
      effect: "private",
      readOnly: true,
      output: "[ { text } ]",
      examples: ["pal peer inbox"],
      run: () => [],
      text: () => "No new messages.",
    }),
    defineCommand({
      name: "peer send",
      summary: "Send the peer a message.",
      effect: "others",
      args: [{ name: "text", description: "The message.", rest: true }],
      examples: ['pal peer send hello --why "Jo asked me to say hello"'],
      run: () => ({ sent: true }),
    }),
  ],
});

quietPipes(process);
process.exitCode = await runCli(tool, process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin });
