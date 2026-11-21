import { quietPipes, runCli } from "#ouro-ax/cli.ts";
import { defineCli, defineCommand } from "#ouro-ax/ax-command.ts";

const cli = defineCli({
  name: "images",
  about: ["images: the widths a folder of pictures is written at, for the site."],
  command: defineCommand({
    name: "sizes",
    summary: "The widths each picture is written at, for a folder.",
    effect: "private",
    readOnly: true,
    examples: ["images site/showcase"],
    args: [
      { name: "folder", description: "The folder of pictures.", required: true },
      { name: "set", description: "The widths to write: web, or print for the larger ones.", values: ["web", "print"], default: "web" },
    ],
    flags: {
      wide: { type: "boolean", description: "Adds the widest size." },
      quality: { type: "number", description: "The quality to write at, from 1 to 100.", min: 1, max: 100, default: 80 },
    },
    output: "{ folder, set, quality, sizes: number[] }",
    run: (i) => {
      const widths = new Set([...(i["set"] === "print" ? [640, 1280] : [320, 640]), ...(i["wide"] === true ? [1280] : [])]);
      return { folder: String(i["folder"]), set: String(i["set"]), quality: i["quality"], sizes: [...widths] };
    },
  }),
});
quietPipes(process);
process.exitCode = await runCli(cli, process.argv.slice(2), process);
