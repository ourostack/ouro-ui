// An entry point that reads its words through shapes the other fixtures don't: a spread copy, a word in a condition,
// a callback over the words and a loop over them.
const args = [...process.argv].slice(2)
const mode = args[0] === "watch" ? "watch" : "once"
args.forEach((word) => {
  if (word === "verbose") console.log(mode)
})
for (const word of process.argv.slice(2)) {
  if (word === "dry-run") console.log(word)
}
const loud = args[1] === "loud"
if (loaders().includes(args[0])) console.log(loud)

function loaders(): string[] {
  return []
}
