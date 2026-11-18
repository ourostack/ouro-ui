// A GitHub in memory, for Ouro Current: one repository with its refs, commits, trees, blobs and pull requests,
// answering the requests keepRepo makes. current.test.mjs runs Current against it, and local-update.mjs runs it on an
// app on disk, as an update reaches a product (the install test's current variant).
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { BRANCH } from "./current.mjs";
import { createGitHub } from "./github.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** A gzipped tar like GitHub's: one top folder, and a pax record for a long name. */
export function tarball(files) {
  const blocks = [];
  const header = (name, size, type) => {
    const block = Buffer.alloc(512);
    block.write(name.slice(0, 99), 0);
    block.write(size.toString(8).padStart(11, "0"), 124);
    block.write(type, 156);
    return block;
  };
  const pad = (bytes) => Buffer.concat([bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
  for (const [path, content] of Object.entries(files)) {
    const name = `ourostack-ouro-ui-abc123/${path}`;
    const bytes = Buffer.from(content);
    if (name.length > 99) {
      const rest = ` path=${name}\n`;
      let size = rest.length + 2;
      while (String(size).length + rest.length !== size) size = String(size).length + rest.length;
      const pax = Buffer.from(`${size}${rest}`);
      blocks.push(header("pax", pax.length, "x"), pad(pax));
    }
    blocks.push(header(name, bytes.length, "0"), pad(bytes));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

// ---- A GitHub in memory: one repository, its refs, commits, trees, blobs and pull requests ----------------

export function fakeRepo(files, { mergeMethods = ["SQUASH"], latestRelease = null, name = "o/r", queued = () => false, dispatch = 204 } = {}) {
  let next = 1;
  const id = () => `${(next++).toString(16).padStart(40, "0")}`;
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  const refs = new Map();
  const pulls = [];
  const calls = [];
  const blob = (content) => {
    const sha = sha256(content).slice(0, 40);
    blobs.set(sha, Buffer.from(content));
    return sha;
  };
  const tree = (entries) => {
    const sha = sha256(JSON.stringify([...entries].sort())).slice(0, 40);
    trees.set(sha, new Map(entries));
    return sha;
  };
  const root = tree(Object.entries(files).map(([path, text]) => [path, blob(text)]));
  const main = id();
  commits.set(main, { tree: root, parents: [] });
  refs.set("main", main);
  const ok = (data, status = 200) => ({ status, headers: new Map(), text: async () => JSON.stringify(data), arrayBuffer: async () => Buffer.from(JSON.stringify(data)) });
  const missing = () => ({ status: 404, headers: new Map(), text: async () => "Not Found" });
  const fetch = async (url, init) => {
    const path = url.replace("https://api.github.com/", "").replace(`repos/${name}`, "repos/o/r");
    const method = init.method;
    const input = init.body ? JSON.parse(init.body) : null;
    calls.push(`${method} ${path}`);
    let match;
    if (method === "GET" && path === "repos/o/r") return ok({ default_branch: "main", private: false, owner: { login: "o" } });
    if ((match = /^repos\/o\/r\/git\/ref\/heads\/(.+)$/.exec(path)) && method === "GET") {
      const name = decodeURIComponent(match[1]);
      return refs.has(name) ? ok({ object: { sha: refs.get(name) } }) : missing();
    }
    if ((match = /^repos\/o\/r\/git\/trees\/([^?]+)\?recursive=1$/.exec(path))) {
      const sha = commits.get(match[1])?.tree ?? match[1];
      return ok({ sha, truncated: false, tree: [...trees.get(sha)].map(([p, s]) => ({ path: p, type: "blob", sha: s })) });
    }
    if ((match = /^repos\/o\/r\/git\/blobs\/(.+)$/.exec(path)) && method === "GET") return ok({ content: blobs.get(match[1]).toString("base64") });
    if ((match = /^repos\/o\/r\/compare\/([0-9a-f]+)\.\.\.(.+)$/.exec(path))) {
      const head = refs.get(decodeURIComponent(match[2])) ?? match[2];
      const seen = new Set();
      const walk = [head];
      while (walk.length) {
        const sha = walk.pop();
        if (seen.has(sha)) continue;
        seen.add(sha);
        walk.push(...(commits.get(sha)?.parents ?? []));
      }
      return ok({ status: match[1] === head ? "identical" : seen.has(match[1]) ? "ahead" : "diverged" });
    }
    if ((match = /^repos\/o\/r\/git\/commits\/(.+)$/.exec(path)) && method === "GET") {
      const commit = commits.get(match[1]);
      return ok({ sha: match[1], message: commit.message, tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })) });
    }
    if (path === "repos/o/r/git/blobs") return ok({ sha: blob(Buffer.from(input.content, "base64")) }, 201);
    if (path === "repos/o/r/git/trees") {
      const base = new Map(trees.get(input.base_tree));
      for (const entry of input.tree) {
        if (entry.sha === null) base.delete(entry.path);
        else base.set(entry.path, entry.sha);
      }
      return ok({ sha: tree([...base]) }, 201);
    }
    if (path === "repos/o/r/git/commits") {
      const sha = id();
      commits.set(sha, { tree: input.tree, parents: input.parents, message: input.message });
      return ok({ sha }, 201);
    }
    if (path === "repos/o/r/git/refs" && method === "POST") {
      refs.set(input.ref.replace("refs/heads/", ""), input.sha);
      return ok({}, 201);
    }
    if ((match = /^repos\/o\/r\/git\/refs\/heads\/(.+)$/.exec(path)) && method === "PATCH") {
      // GitHub's answer for the branch of a pull request in a merge queue.
      if (queued()) return { status: 422, headers: new Map(), text: async () => JSON.stringify({ message: "A pull request for this branch has been added to a merge queue. Branches that\nare queued for merging cannot be updated. To modify this branch, dequeue the\nassociated pull request.\n" }) };
      refs.set(match[1], input.sha);
      return ok({});
    }
    if ((match = /^repos\/o\/r\/contents\/([^?]+)\?ref=(.+)$/.exec(path)) && method === "GET") {
      const sha = trees.get(commits.get(match[2]).tree).get(decodeURIComponent(match[1]));
      return sha ? ok({ content: blobs.get(sha).toString("base64") }) : missing();
    }
    if ((match = /^repos\/o\/r\/tarball\/(.+)$/.exec(path)) && method === "GET") {
      const at = [...trees.get(commits.get(match[1]).tree)].map(([p, s]) => [p, blobs.get(s).toString("utf8")]);
      return { status: 200, headers: new Map(), arrayBuffer: async () => tarball(Object.fromEntries(at)) };
    }
    if (path === "repos/o/r/releases/latest") return latestRelease ? ok({ tag_name: latestRelease }) : missing();
    if (path.startsWith("repos/o/r/pulls?state=open")) return ok(pulls.filter((pr) => pr.state === "open"));
    if (path === "repos/o/r/pulls" && method === "POST") {
      const pr = { number: pulls.length + 1, node_id: `PR${pulls.length + 1}`, html_url: `https://example.test/pull/${pulls.length + 1}`, state: "open", title: input.title, body: input.body, head: input.head, autoMerge: null };
      pulls.push(pr);
      return ok(pr, 201);
    }
    if ((match = /^repos\/o\/r\/pulls\/(\d+)$/.exec(path)) && method === "GET") return ok(pulls[Number(match[1]) - 1]);
    if ((match = /^repos\/o\/r\/pulls\/(\d+)$/.exec(path)) && method === "PATCH") {
      const pr = pulls[Number(match[1]) - 1];
      Object.assign(pr, input);
      return ok(pr);
    }
    if (path === "repos/o/r/dispatches" && method === "POST") {
      calls.push(`repository_dispatch ${input.event_type} ${input.client_payload.sha}${dispatch < 400 ? "" : ` refused ${dispatch}`}`);
      return dispatch < 400 ? ok({}, dispatch) : ok({ message: "Resource not accessible by integration" }, dispatch);
    }
    if (/^repos\/o\/r\/issues\/\d+\/comments$/.test(path)) return ok({}, 201);
    if (path === "graphql") {
      const pr = pulls.find((item) => item.node_id === input.variables.id);
      if (input.query.includes("disablePullRequestAutoMerge")) {
        calls.push(`disarm ${pr.number} at ${refs.get(BRANCH)}`);
        pr.autoMerge = null;
        pr.auto_merge = null;
        return ok({ data: { disablePullRequestAutoMerge: { clientMutationId: null } } });
      }
      calls.push(`arm ${pr.number} at ${refs.get(BRANCH)}`);
      if (!mergeMethods.includes(input.variables.method)) return ok({ errors: [{ message: `Merge method ${input.variables.method.toLowerCase()} merging is not allowed on this repository` }] });
      pr.autoMerge = input.variables.method;
      pr.auto_merge = { merge_method: input.variables.method.toLowerCase() };
      pr.mergeCommit = { headline: input.variables.headline, body: input.variables.body };
      return ok({ data: { enablePullRequestAutoMerge: { clientMutationId: null } } });
    }
    throw new Error(`fake GitHub has no ${method} ${path}`);
  };
  const fileAt = (ref, path) => blobs.get(trees.get(commits.get(refs.get(ref)).tree).get(path))?.toString();
  /** Every file on a branch, as a Map of path to bytes. */
  const filesAt = (ref) => new Map([...trees.get(commits.get(refs.get(ref)).tree)].map(([path, sha]) => [path, blobs.get(sha)]));
  return { fetch, gh: createGitHub({ token: "t", fetch, sleep: async () => {} }), commitTree: (sha) => commits.get(sha).tree, refs, pulls, calls, fileAt, filesAt, setMain: (changes) => {
    const base = new Map(trees.get(commits.get(refs.get("main")).tree));
    for (const [path, text] of Object.entries(changes)) base.set(path, blob(text));
    const sha = id();
    commits.set(sha, { tree: tree([...base]), parents: [refs.get("main")] });
    refs.set("main", sha);
  } };
}
