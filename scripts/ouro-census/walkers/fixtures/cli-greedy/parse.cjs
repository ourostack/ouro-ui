// Built stand-in for parse.ts.
exports.parseCommand = function parseCommand(args) {
  if (args[0] === "up") return { kind: "up" };
  if (args[0] === "pair") {
    if (args[1] !== "--left") throw new Error("Usage: pair --left --right");
    if (args[2] !== "--right") throw new Error("Usage: pair --left --right (missing --right)");
    return { kind: "pair" };
  }
  throw new Error("Unknown command");
};
