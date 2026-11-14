// Splits the registry items on stdin (one address per line, a path or URL ending in <name>.json) into
// <parts> groups of about the same number of files, the largest item first into the group with the
// fewest so far, and prints the items of group <part>. Usage: split-items.mjs <items dir> <parts> <part>
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

export function split(items, weight, parts) {
  const groups = Array.from({ length: parts }, () => ({ total: 0, items: [] }));
  const order = items.map((item, index) => ({ item, index, size: weight(item) }));
  order.sort((a, b) => b.size - a.size || a.index - b.index);
  for (const entry of order) {
    const group = groups.reduce((least, next) => (next.total < least.total ? next : least));
    group.total += entry.size;
    group.items.push(entry.item);
  }
  return groups.map((group) => group.items);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, parts, part] = process.argv.slice(2);
  const items = readFileSync(0, "utf8").split("\n").filter(Boolean);
  const weight = (item) => {
    const file = join(dir, basename(item).replace(/\.json$/, "") + ".json");
    return JSON.parse(readFileSync(file, "utf8")).files?.length ?? 1;
  };
  for (const item of split(items, weight, Number(parts))[Number(part)]) console.log(item);
}
