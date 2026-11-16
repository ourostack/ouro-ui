/* global URL, URLSearchParams */
// Ouro MD's screen for the benchmark: the documents and an editor, as a person sees them, served from one trial's
// store. Plain server-rendered HTML with labelled controls, so the browser arm's accessibility tree and the bridge
// arm's snapshot read the same screen. The editor's Save is the person's own edit of the whole text; "Add to Markdown
// Document" is the Edit menu's command. Each carries its generated `data-ax-action` prop (generated/web.ts).
import http from "node:http";
import { AppError } from "../app-error.mjs";
import { folderOf, nameOf } from "./store.mjs";

const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const docUrl = (file) => `/document?path=${encodeURIComponent(file)}`;
const lf = (text) => String(text ?? "").replace(/\r\n?/g, "\n");

function page(title, body, status) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)} · Ouro MD</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:24px;max-width:44rem}textarea{width:100%;font:14px/1.5 ui-monospace,monospace}</style></head>
<body><nav aria-label="Ouro MD"><a href="/">Documents</a></nav>
<main><h1>${escape(title)}</h1>${status ? `<p role="status">${escape(status)}</p>` : ""}${body}</main></body></html>`;
}

function listPage(state, status) {
  const rows = state.documents.map((doc) => `<li><a href="${docUrl(doc.path)}">${escape(nameOf(doc.path))}</a>${folderOf(doc.path) ? ` <span>in ${escape(folderOf(doc.path))}</span>` : ""}</li>`).join("\n");
  return page("Documents", `<ul aria-label="Documents">${rows}</ul>`, status);
}

function documentPage(doc, status) {
  return page(
    nameOf(doc.path),
    `<form method="post" action="/document/save">
<input type="hidden" name="path" value="${escape(doc.path)}">
<p><label for="markdown">Markdown</label><br><textarea id="markdown" name="markdown" rows="12">${escape(doc.markdown)}</textarea></p>
<p><button type="submit" data-ax-action="replace-document">Save</button></p>
</form>
<h2>Add to Markdown Document</h2>
<form method="post" action="/document/append">
<input type="hidden" name="path" value="${escape(doc.path)}">
<p><label for="addition">Markdown to add</label><br><textarea id="addition" name="markdown" rows="3" required></textarea></p>
<p><button type="submit" data-ax-action="append-to-document">Add to Markdown Document</button></p>
</form>`,
    status,
  );
}

async function readForm(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return Object.fromEntries(new URLSearchParams(body));
}

/** Starts the screen for `store` on a free local port; resolves to `{ url, close }`. */
export async function startServer(store) {
  let flash = "";
  const take = () => {
    const message = flash;
    flash = "";
    return message;
  };
  const redirect = (response, to, message) => {
    flash = message;
    response.writeHead(303, { location: to });
    response.end();
  };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://ouro-md.test");
    const send = (status, html) => {
      response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    };
    try {
      if (request.method === "GET" && url.pathname === "/") return send(200, listPage(store.state, take()));
      if (request.method === "GET" && url.pathname === "/document") {
        const doc = store.state.documents.find((candidate) => candidate.path === url.searchParams.get("path"));
        return doc ? send(200, documentPage(doc, take())) : send(404, page("Not found", "<p>No such document.</p>"));
      }
      if (request.method === "POST" && url.pathname === "/document/save") {
        const form = await readForm(request);
        store.handlers.replace_document({ document: form.path, markdown: lf(form.markdown), confirmed: true });
        return redirect(response, docUrl(form.path), "Saved.");
      }
      if (request.method === "POST" && url.pathname === "/document/append") {
        const form = await readForm(request);
        const { summary } = store.handlers.append_to_document({ document: form.path, markdown: lf(form.markdown) });
        return redirect(response, docUrl(form.path), summary);
      }
      return send(404, page("Not found", "<p>No such page.</p>"));
    } catch (error) {
      if (error instanceof AppError) return send(400, page("Something went wrong", `<p role="alert">${escape(error.message)}</p>`));
      return send(500, page("Something went wrong", "<p role=\"alert\">The server failed.</p>"));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
