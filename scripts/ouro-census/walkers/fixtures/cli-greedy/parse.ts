// A parser whose `pair` word needs two flags in order, so no single filler reaches its kind: the walker has to step
// through them. parse.cjs is its built form.
export type Command = { kind: "pair" } | { kind: "up" }

export function parseCommand(args: string[]): Command {
  if (args[0] === "up") return { kind: "up" }
  if (args[0] === "pair") {
    if (args[1] !== "--left") throw new Error("Usage: pair --left --right")
    if (args[2] !== "--right") throw new Error("Usage: pair --left --right (missing --right)")
    return { kind: "pair" }
  }
  throw new Error("Unknown command")
}
