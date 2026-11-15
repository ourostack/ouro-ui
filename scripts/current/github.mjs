// A small GitHub REST client for Ouro Current: JSON in and out, retries on the failures that pass (a 5xx, a rate limit,
// a dropped connection), and the GitHub App's own sign-in (a JWT, then an installation token). Node built-ins only.
import { Buffer } from "node:buffer";
import { createSign } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";

const API = "https://api.github.com";
const sleepFor = (ms) => wait(ms);

/** An error from GitHub, with its status, so a caller can tell "not there" (404) from a failure. */
export class GitHubError extends Error {
  constructor(method, path, status, message) {
    super(`${method} ${path}: ${status} ${message}`);
    this.status = status;
  }
}

/** Whether a failed request is worth asking again: a server error, a rate limit, or no answer at all. */
export function retryable(status, message = "") {
  if (status === 0 || status >= 500 || status === 429) return true;
  return status === 403 && /rate limit|secondary|abuse/i.test(message);
}

/**
 * A client that authenticates with `token` (an installation token, the workflow's token, or a JWT with `scheme`
 * "Bearer"). It tries a request up to `attempts` times, waiting longer each time, or as long as GitHub says.
 */
export function createGitHub({ token, scheme = "token", fetch: doFetch = globalThis.fetch, sleep = sleepFor, attempts = 4 } = {}) {
  async function request(method, path, body, { raw = false, accept } = {}) {
    const url = path.startsWith("https://") ? path : `${API}/${path.replace(/^\//, "")}`;
    let last;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let status = 0;
      let message;
      let response;
      try {
        response = await doFetch(url, {
          method,
          headers: {
            accept: accept ?? "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
            "user-agent": "ouro-current",
            ...(token ? { authorization: `${scheme} ${token}` } : {}),
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        status = response.status;
        if (status < 400) {
          if (raw) return Buffer.from(await response.arrayBuffer());
          if (status === 204) return null;
          const text = await response.text();
          return text ? JSON.parse(text) : null;
        }
        message = await response.text();
      } catch (error) {
        message = error.message;
      }
      last = new GitHubError(method, path, status, message.slice(0, 300));
      if (!retryable(status, message) || attempt === attempts) throw last;
      const told = Number(response?.headers?.get?.("retry-after"));
      await sleep(Number.isFinite(told) && told > 0 ? Math.min(told, 120) * 1000 : 1000 * 2 ** attempt);
    }
    throw last;
  }
  const api = {
    request,
    get: (path, options) => request("GET", path, undefined, options),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    put: (path, body) => request("PUT", path, body),
    /** Every page of a list; `key` names the array when GitHub wraps it (`repositories`). */
    async all(path, key) {
      const out = [];
      for (let page = 1; ; page += 1) {
        const data = await request("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
        const items = key ? data[key] : data;
        out.push(...items);
        if (items.length < 100) return out;
      }
    },
    /** A file's text and blob sha, or null when it is not there. */
    async file(repo, path, ref) {
      try {
        const data = await request("GET", `repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
        if (Array.isArray(data) || data.type !== "file") return null;
        return { text: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },
    /** A GraphQL query or mutation. */
    async graphql(query, variables) {
      const data = await request("POST", "graphql", { query, variables });
      if (data.errors?.length) throw new GitHubError("POST", "graphql", 200, data.errors.map((error) => error.message).join("; "));
      return data.data;
    },
  };
  return api;
}

const base64url = (value) => Buffer.from(value).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** The GitHub App's JSON Web Token, valid for nine minutes, signed with its private key (RS256). */
export function appJwt(appId, privateKey, now = Date.now()) {
  const issued = Math.floor(now / 1000) - 60;
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ iat: issued, exp: issued + 540, iss: String(appId) }));
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${base64url(signature)}`;
}
