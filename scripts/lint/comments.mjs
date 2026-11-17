// Comment rules, as an ESLint plugin. It uses only the API oxlint's jsPlugins share, so an app on oxlint
// can load the same file (spoonjoy-v2 does):
//
// - no-orphan-doc: a doc block (/** … */) with another doc block directly after it. Tools attach
//   only the last block to the code below, so the first describes nothing: it was left behind when
//   the code it described moved or was deleted.

const isDoc = (comment) => comment.type === "Block" && comment.value.startsWith("*") && comment.value !== "*";

const noOrphanDoc = {
  meta: {
    type: "problem",
    docs: { description: "Disallow a doc block followed directly by another doc block" },
    messages: {
      orphan:
        "This doc block describes nothing: another doc block follows it directly, and only that one attaches to the code below. Merge the two, move this one to the code it describes, or delete it.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        const comments = sourceCode.getAllComments();
        for (let i = 0; i + 1 < comments.length; i++) {
          const [doc, next] = [comments[i], comments[i + 1]];
          if (!isDoc(doc) || !isDoc(next)) continue;
          const between = sourceCode.text.slice(doc.range[1], next.range[0]);
          if (/^[ \t]*\r?\n?[ \t]*$/.test(between)) context.report({ loc: doc.loc, messageId: "orphan" });
        }
      },
    };
  },
};

export default { meta: { name: "comments" }, rules: { "no-orphan-doc": noOrphanDoc } };
