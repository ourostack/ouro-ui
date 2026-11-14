import { quietPipes, runCli } from "../cli.ts";
import { defineCli, defineCommand } from "../command.ts";

const cli = defineCli({
  name: "images",
  about: ["images: the widths a folder of pictures is written at, for the site."],
  command: defineCommand({
    name: "sizes",
    summary: "The widths each picture is written at, for a folder.",
    effect: "private",
    readOnly: true,
    examples: ["images site/showcase"],
    args: [{ name: "folder", description: "The folder of pictures.", required: true }],
    flags: { wide: { type: "boolean", description: "Adds the widest size." } },
    output: "{ folder, sizes: number[] }",
    run: (i) => ({ folder: String(i["folder"]), sizes: i["wide"] === true ? [320, 640, 1280] : [320, 640] }),
  }),
});
quietPipes(process);
process.exitCode = await runCli(cli, process.argv.slice(2), process);
