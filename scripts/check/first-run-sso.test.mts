import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import tls from "node:tls";

import type { FirstRunSession } from "../../registry/ouro/check/first-run-session.ts";
import { helloAlpn, holds, judgeHeld, makeCerts, managedMac, serve, sniOf, ssoExtension, upstreamLookup, type StandInEvent } from "../../registry/ouro/check/first-run-sso.ts";
import { system, type System } from "../../registry/ouro/check/first-run-system.ts";

// A managed Mac's SSO extension, played by the stand-in: its TLS reading, its holds and pass-throughs against a real local
// identity provider, the judge, and its setup on a made-up Mac (a `System` that answers the security, hosts and DNS
// commands, and runs openssl for real). CI's First run SSO job (scripts/check/first-run-sso/proof.mts) runs it on a real Mac.

const HOST = "login.example.test";
const OTHER = "other.example.test";
const HOLD = { path: "/oauth2/v2\\.0/authorize$", params: { prompt: "none" } };
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-first-run-sso-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** The first bytes a TLS client sends: its hello. */
async function hello(o: tls.ConnectionOptions): Promise<Buffer> {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const got = new Promise<Buffer>((resolve) => server.once("connection", (s) => s.once("data", (d: Buffer) => (resolve(d), s.destroy()))));
  const c = tls.connect({ host: "127.0.0.1", port: (server.address() as net.AddressInfo).port, ...o });
  c.on("error", () => {});
  const b = await got;
  server.close();
  return b;
}

const freePort = async () => {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
};

/** A ClientHello written byte by byte: its extensions, and a record that can lie about its lengths or carry bytes after it. */
const u16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);
const ext = (type: number, body: Buffer) => Buffer.concat([u16(type), u16(body.length), body]);
const sniExt = (name: string) => ext(0, Buffer.concat([u16(name.length + 3), Buffer.from([0]), u16(name.length), Buffer.from(name)]));
const alpnExt = (protocols: string[]) => {
  const list = Buffer.concat(protocols.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])));
  return ext(0x10, Buffer.concat([u16(list.length), list]));
};
function clientHello(exts: Buffer[], o: { extLen?: number; type?: number; first?: number; after?: Buffer } = {}): Buffer {
  const all = Buffer.concat(exts);
  const body = Buffer.concat([u16(0x0303), Buffer.alloc(32), Buffer.from([0]), u16(2), u16(0x1301), Buffer.from([1, 0]), u16(o.extLen ?? all.length), all]);
  const handshake = Buffer.concat([Buffer.from([o.type ?? 1, 0]), u16(body.length), body]);
  return Buffer.concat([Buffer.from([o.first ?? 0x16, 3, 1]), u16(handshake.length), handshake, o.after ?? Buffer.alloc(0)]);
}

/** The identity provider itself, with a certificate of its own, and the stand-in's certificates. */
const certs = { mine: path.join(scratch, "stand-in"), real: path.join(scratch, "real") };
assert.ok(makeCerts(certs.mine, [HOST, "nowhere.example.test"], "stand-in").ok);
assert.ok(makeCerts(certs.real, [HOST], "the real host").ok);
const upstream = https.createServer({ key: fs.readFileSync(path.join(certs.real, "leaf.key")), cert: fs.readFileSync(path.join(certs.real, "chain.pem")) }, (req, res) => {
  // A hop-by-hop header of its own, which the stand-in drops, and one of the request's, read back.
  res.setHeader("proxy-connection", "close");
  res.setHeader("x-real", "1");
  res.end(req.headers["x-asked"] ? `real ${req.url} ${req.headers["x-asked"]} ${req.headers["proxy-connection"] ?? "-"}` : `real ${req.url}`);
});
await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
const upstreamPort = (upstream.address() as net.AddressInfo).port;
after(() => upstream.close());

/** A request through the stand-in at `port`, as Apple's networking (ALPN, the stand-in's authority) or another client. */
const ask = (port: number, p: string, o: https.RequestOptions = { ca: fs.readFileSync(path.join(certs.mine, "ca.pem")), ALPNProtocols: ["h2", "http/1.1"] } as https.RequestOptions, servername = HOST) =>
  new Promise<string>((resolve) => {
    const req = https.get({ host: "127.0.0.1", port, servername, path: p, agent: false, ...o }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve(body));
    });
    req.on("error", (e) => resolve(`error: ${e.message}`));
    setTimeout(() => (resolve("no answer"), req.destroy()), 1500);
  });

describe("first-run harness: a managed Mac's SSO extension", () => {
  test("reads a TLS hello's ALPN and server name: Apple's networking offers ALPN, an app's own stack offers none", async () => {
    const apple = await hello({ servername: HOST, ALPNProtocols: ["h2", "http/1.1"] });
    assert.deepEqual(helloAlpn(apple), ["h2", "http/1.1"]);
    assert.equal(sniOf(apple), HOST);
    assert.deepEqual(helloAlpn(await hello({ servername: HOST })), []);
    assert.equal(sniOf(await hello({})), "", "a hello with no server name");
    assert.equal(helloAlpn(apple.subarray(0, 40)), null, "a hello not all here yet");
    assert.equal(helloAlpn(apple.subarray(0, 4)), null, "not even its record header");
    assert.deepEqual(helloAlpn(Buffer.from("GET / HTTP/1.1\r\n\r\n")), [], "not TLS at all");
    assert.equal(sniOf(Buffer.from("GET / HTTP/1.1\r\n\r\n")), "");
    // A handshake record that isn't a ClientHello, and one too short to hold one.
    assert.deepEqual(helloAlpn(Buffer.from([0x16, 3, 1, 0, 4, 0x02, 0, 0, 0])), []);
    assert.deepEqual(helloAlpn(Buffer.from([0x16, 3, 1, 0, 4, 0x01, 0, 0, 0])), []);
  });

  test("reads a hello's lengths as the record gives them, never past its end", () => {
    assert.deepEqual(helloAlpn(clientHello([sniExt("a.test"), alpnExt(["h2", "http/1.1", "x"])])), ["h2", "http/1.1", "x"]);
    assert.equal(sniOf(clientHello([sniExt("a.test"), alpnExt(["h2"])])), "a.test");
    // An empty record, and one that ends just before its session id: no hello in either.
    assert.deepEqual(helloAlpn(Buffer.from([0x16, 3, 1, 0, 0])), []);
    assert.deepEqual(helloAlpn(Buffer.concat([Buffer.from([0x16, 3, 1, 0, 38, 1]), Buffer.alloc(37)])), []);
    // Not a ClientHello, or not a handshake record: nothing, though the bytes after look like one.
    assert.deepEqual(helloAlpn(clientHello([alpnExt(["h2"])], { type: 2 })), []);
    assert.equal(sniOf(clientHello([sniExt("a.test")], { type: 2 })), "");
    assert.equal(sniOf(clientHello([sniExt("a.test")], { first: 0x17 })), "");
    // Extensions that claim to run past the record: what follows the record is not read.
    assert.deepEqual(helloAlpn(clientHello([], { extLen: 20, after: alpnExt(["h2"]) })), []);
    assert.equal(sniOf(clientHello([], { extLen: 20, after: sniExt("a.test") })), "");
    // Extensions that claim to end early: what follows inside the record is not read either.
    assert.equal(sniOf(clientHello([alpnExt(["h2"]), sniExt("a.test")], { extLen: alpnExt(["h2"]).length })), "");
    // A server name too short to hold a name is passed over for the next.
    assert.equal(sniOf(clientHello([ext(0, Buffer.concat([u16(3), Buffer.from([0]), u16(0)])), sniExt("x.test")])), "x.test");
  });

  test("holds a request by its path and every named parameter", () => {
    assert.equal(holds(HOLD, new URL(`https://${HOST}/common/oauth2/v2.0/authorize?prompt=none&x=1`)), true);
    assert.equal(holds(HOLD, new URL(`https://${HOST}/common/oauth2/v2.0/authorize?prompt=login`)), false);
    assert.equal(holds(HOLD, new URL(`https://${HOST}/common/oauth2/v2.0/token?prompt=none`)), false);
    assert.equal(holds({ path: "^/held$" }, new URL(`https://${HOST}/held`)), true);
  });

  test("looks a host up where it really is, one address or all, and fails a host it has none for", () => {
    const lookup = upstreamLookup({ [HOST]: ["2001:db8::1", "192.0.2.1"] }, HOST) as unknown as (h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) => void;
    const got: unknown[][] = [];
    lookup(HOST, { all: true }, (...a) => void got.push(a));
    lookup(HOST, {}, (...a) => void got.push(a));
    (upstreamLookup({}, "nowhere.invalid") as unknown as typeof lookup)("nowhere.invalid", { all: true }, (...a) => void got.push(a));
    assert.deepEqual(got.slice(0, 2), [[null, [{ address: "2001:db8::1", family: 6 }, { address: "192.0.2.1", family: 4 }]], [null, "2001:db8::1", 6]]);
    assert.match(String(got[2]![0]), /no address for nowhere\.invalid/);
  });

  test("the stand-in holds the silent sign-in unanswered, passes the sign-in page, and leaves a client with no ALPN alone", async () => {
    const events: StandInEvent[] = [];
    const s = await serve({ hosts: [HOST, "nowhere.example.test"], hold: HOLD, key: path.join(certs.mine, "leaf.key"), cert: path.join(certs.mine, "chain.pem"), upstream: { [HOST]: ["127.0.0.1"] }, port: 0, upstreamPort, ca: path.join(certs.real, "ca.pem") }, (e) => events.push(e));
    try {
      assert.equal(await ask(s.port, "/common/oauth2/v2.0/authorize?client_id=x&prompt=none&state=s"), "no answer");
      assert.equal(await ask(s.port, "/common/oauth2/v2.0/authorize?client_id=x&prompt=select_account"), "real /common/oauth2/v2.0/authorize?client_id=x&prompt=select_account");
      // Headers pass both ways but hop-by-hop ones, which are this connection's own.
      const headers = await new Promise<{ body: string; headers: http.IncomingHttpHeaders }>((resolve) => {
        https.get({ host: "127.0.0.1", port: s.port, servername: HOST, path: "/headers", agent: false, ca: fs.readFileSync(path.join(certs.mine, "ca.pem")), ALPNProtocols: ["http/1.1"], headers: { "x-asked": "yes", "proxy-connection": "keep-alive" } } as https.RequestOptions, (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => resolve({ body, headers: res.headers }));
        });
      });
      assert.equal(headers.body, "real /headers yes -");
      assert.equal(headers.headers["x-real"], "1");
      assert.equal(headers.headers["proxy-connection"], undefined);
      // An app's own stack (no ALPN) meets the real host and its certificate, even for a request the extension would hold.
      assert.equal(await ask(s.port, "/common/oauth2/v2.0/authorize?prompt=none", { ca: fs.readFileSync(path.join(certs.real, "ca.pem")) }), "real /common/oauth2/v2.0/authorize?prompt=none");
      // A host the stand-in takes but can't find: the request fails, named, and the client's connection ends.
      assert.match(await ask(s.port, "/x", undefined, "nowhere.example.test"), /^error: /);
      // One with no ALPN for a host with no address goes to its own name, which doesn't resolve: the connection ends.
      assert.match(await ask(s.port, "/x", { ca: fs.readFileSync(path.join(certs.real, "ca.pem")) }, "nowhere.example.test"), /^error: |^no answer$/);
      assert.deepEqual(
        events.filter((e) => e.ev !== "ready").map((e) => [e.ev, "host" in e ? e.host : "", "prompt" in e ? e.prompt : null]),
        [["held", HOST, "none"], ["passed", HOST, "select_account"], ["passed", HOST, null], ["failed", "nowhere.example.test", null]],
        "the stand-in names what it held, passed and failed, and never sees the app's own stack",
      );
      assert.match((events.at(-1) as { why?: string }).why!, /no address for nowhere\.example\.test/);
      // A request still held when the stand-in closes ends with it.
      const held = https.get({ host: "127.0.0.1", port: s.port, servername: HOST, path: "/common/oauth2/v2.0/authorize?prompt=none", agent: false, ca: fs.readFileSync(path.join(certs.mine, "ca.pem")), ALPNProtocols: ["http/1.1"] } as https.RequestOptions);
      const ended = new Promise<string>((resolve) => {
        held.on("error", (e) => resolve(e.message));
        setTimeout(() => resolve("still held"), 3000);
      });
      await new Promise((r) => setTimeout(r, 300));
      s.close();
      assert.equal(await ended, "socket hang up");
    } finally {
      s.close();
    }
  });

  test("the stand-in reads a hello sent in pieces, serves only this machine, and refuses a port in use", async () => {
    const events: StandInEvent[] = [];
    const s = await serve({ hosts: [HOST], hold: HOLD, key: path.join(certs.mine, "leaf.key"), cert: path.join(certs.mine, "chain.pem"), upstream: { [HOST]: ["127.0.0.1"] }, port: 0, upstreamPort }, (e) => events.push(e));
    try {
      // A hello in two pieces, then a peer that hangs up: nothing is held or passed.
      const piece = await hello({ servername: HOST, ALPNProtocols: ["http/1.1"] });
      const c = net.connect({ host: "127.0.0.1", port: s.port });
      await new Promise((r) => c.once("connect", r));
      c.write(piece.subarray(0, 20));
      await new Promise((r) => setTimeout(r, 50));
      c.write(piece.subarray(20));
      await new Promise((r) => setTimeout(r, 100));
      c.destroy();
      // Through a pass-through to a real host that isn't there, the connection ends.
      const gone = await freePort();
      const t = await serve({ hosts: [HOST], hold: HOLD, key: path.join(certs.mine, "leaf.key"), cert: path.join(certs.mine, "chain.pem"), upstream: { [HOST]: ["127.0.0.1"] }, port: 0, upstreamPort: gone }, () => {});
      assert.match(await ask(t.port, "/", { ca: fs.readFileSync(path.join(certs.real, "ca.pem")) }), /^error: /);
      // An Apple client that doesn't trust the stand-in ends its own connection.
      assert.match(await ask(t.port, "/", { ALPNProtocols: ["http/1.1"] } as https.RequestOptions), /^error: /);
      t.close();
      // With no port given for the real host, it is 443, which nothing here answers; and a hello for a host the stand-in
      // doesn't name is served as its first host's.
      const u = await serve({ hosts: [HOST], hold: HOLD, key: path.join(certs.mine, "leaf.key"), cert: path.join(certs.mine, "chain.pem"), upstream: { [HOST]: ["127.0.0.1"] }, port: 0 }, () => {});
      assert.match(await ask(u.port, "/"), /^error: /);
      assert.match(await ask(u.port, "/", { ca: fs.readFileSync(path.join(certs.real, "ca.pem")) }), /^error: /);
      assert.match(await ask(u.port, "/", undefined, "unknown.example.test"), /^error: /);
      // A client whose TLS the stand-in won't speak fails the handshake there, and the connection ends.
      assert.match(await ask(u.port, "/", { ALPNProtocols: ["http/1.1"], minVersion: "TLSv1", maxVersion: "TLSv1.1", ciphers: "DEFAULT@SECLEVEL=0" } as https.RequestOptions), /^error: /);
      // A held request whose body keeps coming: the stand-in stops reading it rather than buffer it all.
      const big = https.request({ host: "127.0.0.1", port: s.port, servername: HOST, method: "POST", path: "/common/oauth2/v2.0/authorize?prompt=none", agent: false, ca: fs.readFileSync(path.join(certs.mine, "ca.pem")), ALPNProtocols: ["http/1.1"] } as https.RequestOptions);
      big.on("error", () => {});
      for (let i = 0; i < 256; i++) big.write(Buffer.alloc(64 * 1024, 1));
      await new Promise((r) => setTimeout(r, 1500));
      big.destroy();
      // A record that claims to be a hello but grows past 64 KB without ending is passed through rather than waited on.
      const huge = net.connect({ host: "127.0.0.1", port: u.port });
      huge.on("error", () => {});
      const closed = new Promise<string>((resolve) => {
        huge.on("close", () => resolve("closed"));
        setTimeout(() => resolve("still waiting"), 3000);
      });
      huge.write(Buffer.concat([Buffer.from([0x16, 3, 1, 0xff, 0xff]), Buffer.alloc(65_531)]));
      assert.equal(await closed, "closed");
      huge.destroy();
      u.close();
      // A connection from another address is ended at once.
      const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && !i.internal && i.family === "IPv4")?.address;
      if (lan) {
        const other = net.connect({ host: lan, port: s.port });
        other.on("error", () => {});
        await new Promise((r) => other.once("close", r));
      }
      await assert.rejects(serve({ hosts: [HOST], hold: HOLD, key: path.join(certs.mine, "leaf.key"), cert: path.join(certs.mine, "chain.pem"), upstream: {}, port: s.port }, () => {}), /EADDRINUSE/);
      assert.deepEqual(events.filter((e) => e.ev !== "ready").map((e) => e.ev), ["held"]);
    } finally {
      s.close();
    }
  });

  test("makes a throwaway authority and a leaf for the hosts, and says why when openssl can't", () => {
    const dir = path.join(scratch, "made", "in", "a", "new", "folder");
    const asked: (number | undefined)[] = [];
    const counted: System = { ...system, run: (cmd, args, o) => (asked.push(o?.timeout), system.run(cmd, args, o)) };
    assert.deepEqual(makeCerts(dir, [HOST, "other.example.test"], "made", counted), { ok: true, why: "" });
    assert.deepEqual(asked, [60_000, 60_000, 60_000]);
    const text = execFileSync("openssl", ["x509", "-in", path.join(dir, "leaf.pem"), "-noout", "-text"], { encoding: "utf8" });
    assert.match(text, /DNS:login\.example\.test, DNS:other\.example\.test/);
    const failing: System = { ...system, run: () => ({ status: 1, stdout: "", stderr: ` ${"no openssl ".repeat(30)}` }) };
    const bad = makeCerts(path.join(scratch, "unmade"), [HOST], "unmade", failing);
    assert.equal(bad.ok, false);
    assert.equal(bad.why.length, 200);
    // One step failing is enough to fail, and each failure is named, trimmed.
    let n = 0;
    const third: System = { ...system, run: (cmd, args, o) => (++n === 3 ? { status: 1, stdout: "", stderr: " unable to sign \n" } : system.run(cmd, args, o)) };
    assert.deepEqual(makeCerts(path.join(scratch, "half-made"), [HOST], "half", third), { ok: false, why: "unable to sign" });
    const two: System = { ...system, run: () => ({ status: 1, stdout: "", stderr: " no \n" }) };
    assert.equal(makeCerts(path.join(scratch, "unmade-two"), [HOST], "two", two).why, "no; no; no");
  });

  test("the judge: a silent sign-in held for ever with no way in fails, and one that gives way in time passes", () => {
    const ev = (e: string, at: number, prompt: string | null, p = "/organizations/oauth2/v2.0/authorize"): StandInEvent & { at: number } => ({ ev: e as "held", t: at, at, host: HOST, method: "GET", path: p, prompt });
    const stuck = judgeHeld([ev("held", 9000, "none")], HOLD, 45_000);
    assert.deepEqual(stuck, { ok: false, evidence: "1 silent sign-in held unanswered, the first at 9 s; the app never asked for the sign-in page in the open after it, so the silent sign-in never ended and there was no way in" });
    const gaveWay = judgeHeld([ev("passed", 1000, "select_account"), ev("held", 9000, "none"), ev("passed", 10_000, null, "/other"), ev("held", 22_000, "none"), ev("passed", 32_500, "select_account")], HOLD, 45_000);
    assert.deepEqual(gaveWay, { ok: true, evidence: "2 silent sign-ins held unanswered, the first at 9 s; the app asked for the sign-in page in the open 23.5 s later (the limit is 45 s)" });
    assert.equal(judgeHeld([ev("held", 9000, "none"), ev("failed", 54_000, "select_account")], HOLD, 45_000).ok, true, "a failed ask is still an ask, at the limit");
    assert.equal(judgeHeld([ev("held", 9000, "none"), ev("passed", 80_000, "select_account")], HOLD, 45_000).ok, false, "too late");
    assert.equal(judgeHeld([ev("held", 9000, "none"), ev("passed", 9000, "select_account")], HOLD, 45_000).ok, false, "an ask at the same moment as the hold is not after it");
    assert.deepEqual(judgeHeld([], HOLD, 45_000), { ok: false, evidence: "the stand-in never held a silent sign-in, so this run proves nothing about a managed Mac" });
  });

  describe("on a made-up Mac", () => {
    /** The SHA-1 of the authority the stand-in made in `dir`, as `security` prints it. */
    const hash = (dir: string) => execFileSync("openssl", ["x509", "-noout", "-fingerprint", "-sha1", "-in", path.join(dir, "ca.pem")], { encoding: "utf8" }).replace(/^[^=]*=|[:\s]/g, "");
    /** Apple's networking, trusting the authority the stand-in made in `dir`. */
    const apple = (dir: string) => ({ ca: fs.readFileSync(path.join(dir, "ca.pem")), ALPNProtocols: ["h2", "http/1.1"] }) as https.RequestOptions;
    /** A Mac whose security, hosts and DNS commands answer as `say` says; openssl runs for real; osascript reads through the stand-in. */
    const mac = (port: number, dir: string, say: Partial<Record<"trust" | "verify" | "tee" | "resolve" | "read" | "delete", boolean>> = {}) => {
      const ran: string[] = [];
      // The System keychain holds the authority twice, as a second import would leave it.
      let kept = 2;
      const sys: System = {
        ...system,
        run(cmd, args, o) {
          ran.push(`${[cmd, ...args].join(" ")} [${o?.timeout}]${o?.input === undefined ? "" : " <input>"}`);
          if (cmd === "openssl") return system.run(cmd, args, o);
          const answer = (ok: boolean | undefined, stdout = "") => ({ status: ok === false ? 1 : 0, stdout, stderr: ok === false ? ` ${"refused ".repeat(30)}\n` : "" });
          if (cmd === "sudo" && args[1] === "security" && args[2] === "add-trusted-cert") return answer(say.trust);
          if (cmd === "security" && args[0] === "find-certificate") return answer(true, kept > 0 ? `SHA-1 hash: ${hash(dir)}\n` : "");
          if (cmd === "sudo" && args[2] === "delete-certificate") return say.delete === false ? answer(false) : (kept--, answer(true));
          if (cmd === "security") return answer(say.verify);
          if (cmd === "sudo" && args[1] === "tee") {
            if (say.tee === false) return answer(false);
            fs.writeFileSync(args[2]!, o?.input ?? "");
            return answer(true);
          }
          if (cmd === "dscacheutil") return answer(true, say.resolve === false ? "" : "name: x\nip_address: 127.0.0.1\n");
          if (cmd === "osascript" && say.read !== false) void ask(port, "/", apple(dir));
          return answer(true);
        },
      };
      return { sys, ran };
    };

    test("plays the extension until lifted: trusted, pointed at, read through, then all put back and its keys gone", async () => {
      const dir = path.join(scratch, "played");
      const hostsFile = path.join(scratch, "hosts");
      fs.writeFileSync(hostsFile, "127.0.0.1 localhost");
      const port = await freePort();
      const { sys, ran } = mac(port, dir);
      const log = path.join(scratch, "events.jsonl");
      // The session's clock started 100 s ago.
      const t0 = Date.now() - 100_000;
      const s = await ssoExtension({ hosts: [HOST, OTHER], hold: { path: "^/held$" } }, dir, () => Date.now() - t0, log, { sys, platform: "darwin", hostsFile, port, upstream: { [HOST]: ["127.0.0.1"], [OTHER]: ["127.0.0.1"] }, upstreamPort, ca: path.join(certs.real, "ca.pem") });
      try {
        assert.equal(s.ok, true, s.evidence);
        assert.equal(s.evidence, `the SSO extension's stand-in takes ${HOST}, ${OTHER} (pointed at it, its certificate trusted for the run, and a read through Apple's networking reached it) and holds ^/held$ unanswered`);
        assert.equal(fs.readFileSync(hostsFile, "utf8"), `127.0.0.1 localhost\n# ouro first-run: SSO extension stand-in\n127.0.0.1 ${HOST}\n::1 ${HOST}\n127.0.0.1 ${OTHER}\n::1 ${OTHER}\n`);
        assert.equal(await ask(port, "/held", apple(dir)), "no answer");
        assert.deepEqual(s.events().map((e) => e.ev), ["ready", "passed", "held"]);
        assert.ok(s.events().every((e) => e.at >= 100_000 && e.at < 160_000), "on the session's clock");
        assert.ok(fs.readFileSync(log, "utf8").trim().split("\n").every((l) => JSON.parse(l).at >= 100_000 && JSON.parse(l).at < 160_000), "the log on the session's clock too");
        assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l).ev), ["ready", "passed", "held"]);
      } finally {
        s.lift();
      }
      assert.equal(fs.readFileSync(hostsFile, "utf8"), "127.0.0.1 localhost");
      assert.ok(!fs.existsSync(path.join(dir, "ca.key")) && !fs.existsSync(path.join(dir, "leaf.key")), "its keys are gone");
      // Every command, in order, with its time limit: made, trusted, pointed at, read through, then put back.
      const name = /\/CN=(Ouro first-run SSO stand-in \d+-\d+) /.exec(ran[0]!)?.[1];
      assert.ok(name, ran[0]);
      const f = (n: string) => path.join(dir, n);
      const flushed = ["sudo -n dscacheutil -flushcache [30000]", "sudo -n killall -HUP mDNSResponder [30000]"];
      const find = `security find-certificate -a -Z -c ${name} /Library/Keychains/System.keychain [60000]`;
      const remove = `sudo -n security delete-certificate -Z ${hash(dir)} /Library/Keychains/System.keychain [30000]`;
      assert.deepEqual(ran, [
        `openssl req -x509 -new -nodes -newkey rsa:2048 -sha256 -days 2 -subj /CN=${name} -config ${f("ca.cnf")} -extensions ca -keyout ${f("ca.key")} -out ${f("ca.pem")} [60000]`,
        `openssl req -new -nodes -newkey rsa:2048 -sha256 -subj /CN=${HOST} -config ${f("ca.cnf")} -keyout ${f("leaf.key")} -out ${f("leaf.csr")} [60000]`,
        `openssl x509 -req -sha256 -days 2 -in ${f("leaf.csr")} -CA ${f("ca.pem")} -CAkey ${f("ca.key")} -CAcreateserial -extfile ${f("leaf.cnf")} -extensions leaf -out ${f("leaf.pem")} [60000]`,
        `openssl x509 -noout -fingerprint -sha1 -in ${f("ca.pem")} [60000]`,
        `sudo -n security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${f("ca.pem")} [30000]`,
        `security verify-cert -c ${f("leaf.pem")} -p ssl -s ${HOST} [60000]`,
        `sudo -n tee ${hostsFile} [30000] <input>`,
        ...flushed,
        `dscacheutil -q host -a name ${HOST} [60000]`,
        `dscacheutil -q host -a name ${OTHER} [60000]`,
        `osascript -l JavaScript -e ObjC.import("Foundation"); const d = $.NSData.dataWithContentsOfURL($.NSURL.URLWithString("https://${HOST}/")); d.isNil() ? "nothing" : "read " + d.length [60000]`,
        `sudo -n tee ${hostsFile} [30000] <input>`,
        ...flushed,
        find,
        remove,
        find,
        "sleep 1 [60000]",
        remove,
        find,
      ]);
      let stopped = "";
      for (let i = 0; i < 50 && !stopped.includes("ECONNREFUSED"); i++) stopped = await ask(port, "/");
      assert.equal(stopped, `error: connect ECONNREFUSED 127.0.0.1:${port}`, "the stand-in has stopped");
    });

    test("says why it can't play the extension, and changes nothing it didn't put back", async () => {
      const hostsFile = path.join(scratch, "hosts-unplayed");
      let ran: string[] = [];
      const run = async (say: Parameters<typeof mac>[2], platform = "darwin", hosts = [HOST], hold: typeof HOLD | { path: string } = HOLD) => {
        let s: Awaited<ReturnType<typeof ssoExtension>>;
        // A port freePort found free can be taken by another test file before the stand-in listens on it (#2469):
        // that start is tried again on another port, and any other failure to start is returned as it was.
        for (let attempt = 0; ; attempt++) {
          fs.writeFileSync(hostsFile, "127.0.0.1 localhost\n");
          const port = await freePort();
          const dir = path.join(scratch, `unplayed-${port}`);
          const made = mac(port, dir, say);
          ran = made.ran;
          s = await ssoExtension({ hosts, hold }, dir, () => 0, undefined, { sys: made.sys, platform, hostsFile, port, upstream: { [HOST]: ["127.0.0.1"] }, upstreamPort, ca: path.join(certs.real, "ca.pem") });
          if (attempt === 2 || !/didn't start on port \d+ \(.*EADDRINUSE/.test(s.evidence)) break;
        }
        s.lift();
        assert.equal(s.ok, false);
        assert.equal(fs.readFileSync(hostsFile, "utf8"), "127.0.0.1 localhost\n");
        return s.evidence;
      };
      assert.equal(await run({}, "linux"), "no SSO extension stand-in: it plays a Mac's extension, and this isn't a Mac");
      assert.match(await run({ verify: false }), /^no SSO extension stand-in: the system doesn't trust its certificate \(add-trusted-cert: no message\); run it where sudo -n works, as on a CI runner$/);
      assert.ok((await run({ verify: false, trust: false })).includes(`(add-trusted-cert: ${"refused ".repeat(30).trim().slice(0, 160)});`));
      assert.equal(await run({ tee: false }), "no SSO extension stand-in: it couldn't point the hosts at the stand-in (sudo -n tee /etc/hosts)");
      assert.equal(ran.filter((r) => r.startsWith("sudo -n tee ")).length, 1, "a hosts file it never wrote is not written back");
      // A keychain that keeps refusing the delete is asked five times, then left.
      assert.equal(await run({ read: false, delete: false }), "no SSO extension stand-in: a read through Apple's networking never reached it");
      assert.equal(ran.filter((r) => r.startsWith("sudo -n security delete-certificate ")).length, 5);
      assert.equal(await run({ resolve: false }, "darwin", [HOST, OTHER]), `no SSO extension stand-in: ${HOST}, ${OTHER} don't resolve to the stand-in after /etc/hosts and a flush`);
      assert.ok(!ran.some((r) => r.startsWith("osascript")), "nothing is read through a stand-in the hosts don't reach");
      // A read the stand-in holds, rather than passes, never reached the real host.
      assert.equal(await run({}, "darwin", [HOST], { path: "^/$" }), "no SSO extension stand-in: a read through Apple's networking never reached it");
      assert.equal(await run({ read: false }), "no SSO extension stand-in: a read through Apple's networking never reached it");
      // A host it can't find before it starts: the stand-in has no address for it, but still starts.
      assert.equal(await run({ read: false }, "darwin", [HOST, "nowhere.invalid", "localhost"]), "no SSO extension stand-in: a read through Apple's networking never reached it");

      const noOpenssl: System = { ...system, run: () => ({ status: 1, stdout: "", stderr: "openssl: not found" }) };
      const unmade = await ssoExtension({ hosts: [HOST], hold: HOLD }, path.join(scratch, "unmade-mac"), () => 0, undefined, { sys: noOpenssl, platform: "darwin" });
      // By default: this machine, its own platform, /etc/hosts and port 443; it gives up before any of them is touched.
      assert.equal((await ssoExtension({ hosts: [HOST], hold: HOLD }, path.join(scratch, "default"), () => 0, undefined, { platform: "linux" })).ok, false);
      assert.equal((await ssoExtension({ hosts: [HOST], hold: HOLD }, path.join(scratch, "default-mac"), () => 0, undefined, { sys: noOpenssl })).ok, false);
      assert.equal(unmade.evidence, "no SSO extension stand-in: openssl couldn't make its certificates (openssl: not found; openssl: not found; openssl: not found)");
      assert.deepEqual(unmade.events(), []);
      // A port it can't take: the stand-in ends, and says why.
      const taken = net.createServer();
      await new Promise<void>((r) => taken.listen(0, "::", r));
      const busy = (taken.address() as net.AddressInfo).port;
      const { sys } = mac(busy, path.join(scratch, "busy"));
      const started = Date.now();
      const refused = await ssoExtension({ hosts: [HOST], hold: HOLD }, path.join(scratch, "busy"), () => 0, undefined, { sys, platform: "darwin", hostsFile, port: busy, upstream: { [HOST]: ["127.0.0.1"] } });
      taken.close();
      assert.ok(Date.now() - started < 14_000, "it says so once the stand-in ends, not after its start's 15 s limit");
      assert.match(refused.evidence, new RegExp(`^no SSO extension stand-in: the stand-in didn't start on port ${busy} \\(.*EADDRINUSE.*\\)$`));
    });

    test("the managed-Mac detour holds the silent sign-in for the whole path, then judges whether the app gave way", async () => {
      const port = await freePort();
      const dir = path.join(scratch, "detour");
      const { sys } = mac(port, dir);
      const hostsFile = path.join(scratch, "hosts-detour");
      fs.writeFileSync(hostsFile, "");
      const steps: [string, boolean, string][] = [];
      const notes: [string, unknown][] = [];
      const t0 = Date.now();
      const session = { sys, report: { at: () => Date.now() - t0, step: (n: string, ok: boolean, e: string) => void steps.push([n, ok, e]), note: (e: string, d?: unknown) => void notes.push([e, d]), log: () => {} } } as unknown as FirstRunSession;
      const d = managedMac({ hosts: [HOST], hold: HOLD, dir, machine: { platform: "darwin", hostsFile, port, upstream: { [HOST]: ["127.0.0.1"] }, upstreamPort, ca: path.join(certs.real, "ca.pem") } });
      assert.deepEqual([d.id, d.title], ["managed-mac", "a managed Mac: its SSO extension holds the silent sign-in and never answers it"]);
      await d.before!(session);
      assert.deepEqual(steps.map(([n, ok, e]) => [n, ok, ok ? "" : e]), [["sso-extension", true, ""]]);
      assert.match(steps[0]![2], / and holds \/oauth2\/v2\\\.0\/authorize\$ with prompt=none unanswered$/);
      assert.equal(await ask(port, "/common/oauth2/v2.0/authorize?prompt=none", apple(dir)), "no answer");
      assert.equal(await ask(port, "/common/oauth2/v2.0/authorize?prompt=select_account", apple(dir)), "real /common/oauth2/v2.0/authorize?prompt=select_account");
      d.end(session);
      assert.deepEqual(steps.map(([n, ok]) => [n, ok]), [["sso-extension", true], ["sso-extension-held", true]]);
      assert.match(steps[1]![2], /^1 silent sign-in held unanswered, the first at [\d.]+ s; the app asked for the sign-in page in the open [\d.]+ s later \(the limit is 20 s\)$/);
      assert.deepEqual(notes.map(([e]) => e), ["sso-stand-in passed", "sso-stand-in held", "sso-stand-in passed"]);
      assert.deepEqual({ ...(notes[1]![1] as object), at: 0 }, { at: 0, host: HOST, method: "GET", path: "/common/oauth2/v2.0/authorize", prompt: "none", status: undefined, why: undefined });
      assert.equal(fs.readFileSync(hostsFile, "utf8"), "");

      // Where it couldn't play the extension, the detour says so and judges nothing; the limit is 20 s by default.
      const off = managedMac({ hosts: [HOST], hold: HOLD, dir: path.join(scratch, "detour-off"), machine: { platform: "linux" } });
      steps.length = 0;
      await off.before!(session);
      off.end(session);
      assert.deepEqual(steps, [["sso-extension", false, "no SSO extension stand-in: it plays a Mac's extension, and this isn't a Mac"]]);
      const never = managedMac({ hosts: [HOST], hold: HOLD, dir: path.join(scratch, "detour-never") });
      never.end(session);
      assert.equal(steps.length, 1);
    });
  });
});
