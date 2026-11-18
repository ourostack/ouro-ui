import { test } from "node:test";
import assert from "node:assert/strict";
import { leaks, REDACT_RULES, redactLine, redactText, redactValue, type RedactRule } from "#ouro-ax/redact.ts";

// Secrets are made up and joined at run time, so no scanner mistakes this file for a leak; each has the shape of the real thing.
const j = (...parts: string[]) => parts.join("");
const SECRETS = {
  jwt: j("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".", "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvcmRhbiBMZWUifQ", ".", "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
  githubPat: j("gh", "p_", "R7xk2Qm9Lw4Tz8Vb1Nc6Hy3Jd5Gf0Sa2Pe7U"),
  githubFineGrained: j("github", "_pat_", "11ABCDEFG0aBcDeFgHiJkL_mNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRsTuVwXyZ01"),
  awsKeyId: j("AK", "IA", "Q3EGRT7X2K9MZP4L"),
  awsSecret: j("wJalrXUtnFEMI", "/K7MDENG/", "bPxRfiCY8z3kQ2mN"),
  slack: j("xo", "xb-", "2048163527-4096327054619-Zq8Rk3Wm1Tn6Yp9Vb2Xc5Hd7"),
  stripe: j("sk", "_live_", "51Hc8xK2eZvKYlo2C9pQ3rT7"),
  openai: j("sk", "-proj-", "Fq2Zr8Ky1Wm6Tn3Vb9Xc4Hd0Lp7Js5"),
  npm: j("np", "m_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"),
  google: j("AI", "za", "SyD3x9Kq7Lm2Np4Rs6Tu8Vw0Xy1Za3Bc5De"),
  bearer: j("Q2xpZW50U2VjcmV0", "OnN1cGVyLXNlY3JldA"),
  hex: j("9f86d081884c7d659a2feaa0c55ad015", "a3bf4f1b2b0b822cd15d6c15b0f00a08"),
  cookieValue: j("0.AQoAk8", "Zq2Wm1Tn6Yp9"),
  sessionValue: j("s%3A", "Xk29qLmPz"),
  password: j("Hunter", "2-correct-horse"),
  email: "jordan.lee@contoso.com",
  otherEmail: "sam+alerts@mail.fabrikam.co.uk",
  guid: "6f1c2d9e-4b7a-4c3e-9a51-0d8e2f7b6c41",
  macUser: "jordan.lee",
  linuxUser: "jlee",
  windowsUser: "JLee",
};

test("redactText replaces each shape with its category and keeps the words around it", () => {
  const cases: [string, string][] = [
    [`Authorization: Bearer ${SECRETS.bearer}`, "Authorization: [redacted]"],
    [`curl -H "Cookie: ESTSAUTH=${SECRETS.cookieValue}; sid=${SECRETS.sessionValue}"`, `curl -H "[text]`],
    [`Set-Cookie: session=${SECRETS.sessionValue}; HttpOnly; Secure`, "Set-Cookie: [redacted]"],
    [`x-api-key=${SECRETS.stripe}`, "x-api-key=[redacted]"],
    ["X-Auth-Token: abc 123 and the rest", "X-Auth-Token: [redacted]"],
    ["Cookie : a=1 b", "Cookie : [redacted]"],
    ["Cookie:a=1 b", "Cookie:[redacted]"],
    ["sent Bearer  QWxhZGRpbjpvcGVu", "sent Bearer [token]"],
    ["key sk-abcdefghij12", "key [token]"],
    ["GET http://example.com/a?x=1 and ws://example.com/live", "GET http://example.com/… and ws://example.com/…"],
    ['tokenId=abc123 and password="two words"', "tokenId=[redacted] and password=[redacted]"],
    ["'see you at noon', she said", "'[text]', she said"],
    [`sent with bearer ${SECRETS.bearer} at 19:57`, "sent with bearer [token] at 19:57"],
    [`token ${SECRETS.jwt} expired`, "token [token] expired"],
    [`pushed with ${SECRETS.githubPat} and ${SECRETS.githubFineGrained}`, "pushed with [token] and [token]"],
    [`aws ${SECRETS.awsKeyId}, slack ${SECRETS.slack}, npm ${SECRETS.npm}, google ${SECRETS.google}`, "aws [token], slack [token], npm [token], google [token]"],
    [`keys ${SECRETS.stripe} ${SECRETS.openai}`, "keys [token] [token]"],
    ["GET https://login.example.com/common/oauth2/authorize?client_id=abc&login_hint=jordan", "GET https://login.example.com/…"],
    ["opened https://example.com and wss://example.com/socket", "opened https://example.com and wss://example.com/…"],
    [`clone https://jordan:${SECRETS.password}@git.example.com/team/repo.git`, "clone https://git.example.com/…"],
    [`retry with code=0.AXk9 state=12345 password=${SECRETS.password}`, "retry with code=[redacted] state=[redacted] password=[redacted]"],
    [`signed in as ${SECRETS.email}, then ${SECRETS.otherEmail}`, "signed in as [email], then [email]"],
    [`device ${SECRETS.guid} joined`, "device [id] joined"],
    [`secret ${SECRETS.awsSecret} and sha ${SECRETS.hex}`, "secret [opaque] and sha [opaque]"],
    [`${"Ab".repeat(20)} and ${"12".repeat(20)} stay`, `${"Ab".repeat(20)} and ${"12".repeat(20)} stay`],
    [`read /Users/${SECRETS.macUser}/Library/Logs, /home/${SECRETS.linuxUser}/.config and C:\\Users\\${SECRETS.windowsUser}\\AppData`, "read /Users/[user]/Library/Logs, /home/[user]/.config and C:\\Users\\[user]\\AppData"],
    [`"refresh_token": "${SECRETS.cookieValue}", "state": "up"`, `"refresh_token": "[redacted]", "state": "up"`],
    [`password: ${SECRETS.password}, client_secret: 'Xy7~Q.abc', token "${SECRETS.sessionValue}" and tokens: 3`, "password: [redacted], client_secret: [redacted], token [redacted] and tokens: [redacted]"],
    [`{ accessToken: 's3cr3tpassw0rd', ok: true }`, "{ accessToken: [redacted], ok: true }"],
    [`api-key: 0123abcd\nX-Goog-Api-Key: ${SECRETS.google}`, "api-key: [redacted]\nX-Goog-Api-Key: [redacted]"],
    ["postgres://app:hunter2@localhost:5432/db, redis://:hunter2@cache:6379 and mongodb://jordan:hunter2@db.example.com/app", "postgres://[redacted]@localhost:5432/db, redis://[redacted]@cache:6379 and mongodb://[redacted]@db.example.com/app"],
    ["C:\\Users\\Jordan Lee\\AppData, C:/Users/Jordan Lee/AppData, C:\\\\Users\\\\JLee\\\\AppData and C:\\Documents and Settings\\jlee\\Desktop", "C:\\Users\\[user]\\AppData, C:/Users/[user]/AppData, C:\\\\Users\\\\[user]\\\\AppData and C:\\Documents and Settings\\[user]\\Desktop"],
    [`she wrote "${"I am so sorry about the news. ".repeat(20)}" today`, `she wrote "[text]`],
    ['note: "Hi Sam, the line was cut', 'note: "[text]'],
    ["-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn\n-----END RSA PRIVATE KEY-----\ndone", "[private key]\ndone"],
    ['she wrote "see you at the offsite" and ‘call me’ then “thanks” and \'lunch at noon\'', 'she wrote "[text]" and ‘[text]’ then “[text]” and \'[text]\''],
    ['state "signed-in", mode \'prompt=none\'', 'state "signed-in", mode \'prompt=none\''],
    ["/usr/local/lib/node_modules/some-package/dist/index.js at 0.2.10", "/usr/local/lib/node_modules/some-package/dist/index.js at 0.2.10"],
  ];
  for (const [input, expected] of cases) assert.equal(redactText(input), expected, input);
});

test("redactText turns the person's home folder into ~, and runs an app's own rules first", () => {
  assert.equal(redactText(`/Users/${SECRETS.macUser}/Library/Logs/app.log`, { home: `/Users/${SECRETS.macUser}` }), "~/Library/Logs/app.log");
  assert.equal(redactText("~ and a/b stay as they are", { home: "/" }), "~ and a/b stay as they are", "a home of one character is not a home");
  assert.equal(redactText("/Users/jordan.lee/x", { home: "/Users//jordan.lee" }), "~/x", "a home written with a doubled slash");
  assert.equal(redactText("c:/users/jordan lee/AppData and C:\\\\Users\\\\Jordan Lee\\\\x", { home: "C:\\Users\\Jordan Lee" }), "~/AppData and ~\\\\x", "any letter case, either slash, doubled or not");
  const chatIds: RedactRule = { name: "chat-id", re: /\b19:[A-Za-z0-9_-]+@thread\.v2/g, to: "[chat]" };
  assert.equal(redactText("posted in 19:a1b2c3_d4@thread.v2", { rules: [chatIds] }), "posted in [chat]", "the app's rule wins over the built-in email rule");
  assert.equal(redactText("posted in 19:a1b2c3_d4@thread.v2"), "posted in 19:[email]");
});

test("redactValue keeps keys, numbers, times and codes, and drops secrets and what anyone wrote", () => {
  const line = {
    level: "warn",
    at: "2026-11-17T19:57:02.120Z",
    n: 3,
    ok: true,
    nothing: null,
    version: "0.2.11",
    host: "MacBook-Pro",
    title: "Quarterly plans",
    message: "Signed in as jordan",
    refreshToken: SECRETS.cookieValue,
    sid: "abc",
    note: "the window closed after 3 s",
    from: ["jordan", "sam"],
    url: "https://graph.example.com/v1.0/me/messages?$top=5",
    who: { name: "Jordan" },
    nested: [{ cookie: "x=1", email: SECRETS.email, address: SECRETS.otherEmail }],
    firstName: "Jordan",
    login: "jlee",
    userId: "jordan.lee",
    pass: "hunter2",
    [SECRETS.guid]: { ok: true },
    [SECRETS.email]: 1,
    [SECRETS.otherEmail]: 2,
    "kim@example.org": 3,
    context: "home",
    namespace: "ouro",
    loginHint: "jlee",
  };
  assert.deepEqual(redactValue(line), {
    level: "warn",
    at: "2026-11-17T19:57:02.120Z",
    n: 3,
    ok: true,
    nothing: null,
    version: "0.2.11",
    host: "MacBook-Pro",
    title: "[text]",
    message: "[text]",
    refreshToken: "[redacted]",
    sid: "[redacted]",
    note: "[text]",
    from: ["[text]", "[text]"],
    url: "https://graph.example.com/…",
    who: { name: "[text]" },
    nested: [{ cookie: "[redacted]", email: "[text]", address: "[text]" }],
    firstName: "[text]",
    login: "[text]",
    userId: "[text]",
    pass: "[redacted]",
    "[id]": { ok: true },
    "[email]": 1,
    "[email] 2": 2,
    "[email] 3": 3,
    context: "home",
    namespace: "ouro",
    loginHint: "[text]",
  });
  assert.equal(redactValue(`contact ${SECRETS.email}`), "[text]");
  assert.equal(redactValue(SECRETS.email), "[email]", "one word the rules redact comes back redacted");
  assert.equal(redactValue(`/Users/${SECRETS.macUser}/Library`, { home: `/Users/${SECRETS.macUser}` }), "~/Library", "a one-word value gets the home folder too");
});

test("redactLine reads a JSON line by its values and any other line as text", () => {
  assert.equal(redactLine(`  {"level":"info","event":"sign-in","email":"${SECRETS.email}"}  `), '{"level":"info","event":"sign-in","email":"[text]"}');
  assert.equal(redactLine(`{not json, ${SECRETS.email}}`), "{not json, [email]}");
  assert.equal(redactLine('["jordan", 3]'), '["jordan",3]', "an array line is JSON too");
  assert.equal(redactLine(`19:57:02 sign-in for ${SECRETS.email} took 3 s`, { home: "/Users/jordan" }), "19:57:02 sign-in for [email] took 3 s");
});

test("leaks names each shape left in a text, an app's own included, and nothing in what redaction leaves", () => {
  const raw = [
    `Authorization: Bearer ${SECRETS.bearer}`,
    `"accessToken": "${SECRETS.cookieValue}"`,
    `token ${SECRETS.jwt}`,
    `basic ${SECRETS.bearer}`,
    SECRETS.githubPat,
    "https://example.com/a/b",
    "https://jordan@example.com",
    `password=${SECRETS.password}`,
    SECRETS.email,
    SECRETS.guid,
    SECRETS.hex,
    `/Users/${SECRETS.macUser}`,
    "-----BEGIN PRIVATE KEY-----\nabc",
    `password: ${SECRETS.password}`,
    "postgres://app:hunter2@localhost/db",
    "C:\\Users\\JLee\\AppData",
  ].join("\n");
  assert.deepEqual(leaks(raw).sort(), ["bearer", "email", "guid", "header", "jwt", "opaque", "private-key", "secret", "secret-colon", "secret-field", "service-token", "url", "user-path", "userinfo"]);
  assert.deepEqual(leaks(redactText(raw)), []);
  assert.deepEqual(leaks(`all clear: 8 checks passed in 0.4s, https://example.com/… and /Users/[user]/Library, ${"abcdefghij".repeat(4)}`), []);
  assert.deepEqual(leaks("authorization: foo=[redacted]"), ["header"], "a header's value must itself be redacted");
  assert.deepEqual(leaks("password: /Users/[user]"), ["secret-colon"], "a secret whose value is a cleaned path is still a secret");
  const chatIds: RedactRule = { name: "chat-id", re: /\b19:[A-Za-z0-9_-]+@thread\.v2/g, to: "[chat]" };
  assert.deepEqual(leaks("in 19:abc@thread.v2", { rules: [chatIds] }), ["chat-id", "email"]);
  assert.deepEqual(leaks("in [chat]", { rules: [{ ...chatIds, re: /\[chat\]|19:\w+/g }] }), [], "what the app's rule leaves is clean");
  assert.ok(REDACT_RULES.every((r) => r.re.flags.includes("g")), "every rule replaces every match");
});

test("a log full of real-looking secrets comes out with none of them, and leaks finds nothing left", () => {
  const home = `/Users/${SECRETS.macUser}`;
  const log = [
    `2026-11-17T19:57:02Z info signing in ${SECRETS.email} via https://login.example.com/oauth2/authorize?login_hint=${SECRETS.email}&state=12345`,
    `2026-11-17T19:57:03Z debug request headers: Authorization: Bearer ${SECRETS.jwt}`,
    `2026-11-17T19:57:03Z debug Cookie: ESTSAUTH=${SECRETS.cookieValue}; sid=${SECRETS.sessionValue}`,
    `2026-11-17T19:57:04Z warn retry with refresh_token=${SECRETS.cookieValue} for ${SECRETS.guid}`,
    `{"at":"2026-11-17T19:57:05Z","event":"push","token":"${SECRETS.githubPat}","user":"${SECRETS.macUser}","path":"${home}/code/app"}`,
    `env AWS_ACCESS_KEY_ID=${SECRETS.awsKeyId} AWS_SECRET_ACCESS_KEY=${SECRETS.awsSecret}`,
    `slack ${SECRETS.slack} stripe ${SECRETS.stripe} openai ${SECRETS.openai} npm ${SECRETS.npm} google ${SECRETS.google} gh ${SECRETS.githubFineGrained}`,
    `opened ${home}/Library/Application Support/app and /home/${SECRETS.linuxUser}/.config and C:\\Users\\${SECRETS.windowsUser}\\AppData\\Roaming`,
    `mail to ${SECRETS.otherEmail}: "running late, see you at 3"`,
    `git remote https://${SECRETS.macUser}:${SECRETS.password}@github.com/team/repo.git`,
  ];
  const out = log.map((line) => redactLine(line, { home })).join("\n");
  for (const [name, secret] of Object.entries(SECRETS)) {
    assert.ok(!out.includes(secret), `${name} is still in the output:\n${out}`);
    // Not even a piece of it: no 8 characters in a row of a secret longer than that.
    for (let i = 0; secret.length > 12 && i + 8 <= secret.length; i++) assert.ok(!out.includes(secret.slice(i, i + 8)), `a piece of ${name} (${secret.slice(i, i + 8)}) is still in the output:\n${out}`);
  }
  assert.ok(!out.includes("running late"), "what someone wrote is gone");
  assert.deepEqual(leaks(out), [], out);
  assert.match(out, /2026-11-17T19:57:02Z info signing in \[email\]/, "times and the tool's own words stay");
});

test("a huge line is cut before the rules read it, at a space, so redaction stays fast", () => {
  const started = performance.now();
  assert.equal(redactText("a".repeat(1_000_000)), "[1000000 characters]", "a megabyte with no space becomes its length");
  assert.equal(redactLine(`${"x".repeat(3990)} ${SECRETS.email} ${SECRETS.githubPat}`), `${"x".repeat(3990)} …`, "cut at the last space before the limit, so the token is dropped whole");
  assert.equal(redactText(`${"word ".repeat(1000)}\nshort ${SECRETS.email}`).split("\n")[1], "short [email]", "each line is cut on its own");
  const long = `${"z".repeat(4000)}`;
  assert.equal(redactText(long), long, "a line at the limit is read whole");
  assert.equal(redactText(` ${"a".repeat(5000)}`), "[5001 characters]", "a space only at the start is no place to cut");
  assert.ok(performance.now() - started < 5000, `took ${Math.round(performance.now() - started)} ms`);
});
