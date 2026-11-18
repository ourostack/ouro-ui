import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
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

/** The identity provider itself, with a certificate of its own, and the stand-in's certificates. */
const certs = { mine: path.join(scratch, "stand-in"), real: path.join(scratch, "real") };
assert.ok(makeCerts(certs.mine, [HOST, "nowhere.example.test"], "stand-in").ok);
assert.ok(makeCerts(certs.real, [HOST], "the real host").ok);
const upstream = https.createServer({ key: fs.readFileSync(path.join(certs.real, "leaf.key")), cert: fs.readFileSync(path.join(certs.real, "chain.pem")) }, (req, res) => res.end(`real ${req.url}`));
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
      // An app's own stack (no ALPN) meets the real host and its certificate, even for a request the extension would hold.
      assert.equal(await ask(s.port, "/common/oauth2/v2.0/authorize?prompt=none", { ca: fs.readFileSync(path.join(certs.real, "ca.pem")) }), "real /common/oauth2/v2.0/authorize?prompt=none");
      // A host the stand-in takes but can't find: the request fails, named, and the client's connection ends.
      assert.match(await ask(s.port, "/x", undefined, "nowhere.example.test"), /^error: /);
      // One with no ALPN for a host with no address goes to its own name, which doesn't resolve: the connection ends.
      assert.match(await ask(s.port, "/x", { ca: fs.readFileSync(path.join(certs.real, "ca.pem")) }, "nowhere.example.test"), /^error: |^no answer$/);
      assert.deepEqual(
        events.filter((e) => e.ev !== "ready").map((e) => [e.ev, "host" in e ? e.host : "", "prompt" in e ? e.prompt : null]),
        [["held", HOST, "none"], ["passed", HOST, "select_account"], ["failed", "nowhere.example.test", null]],
        "the stand-in names what it held, passed and failed, and never sees the app's own stack",
      );
      assert.match((events.at(-1) as { why?: string }).why!, /no address for nowhere\.example\.test/);
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
      for (let i = 0; i < 64; i++) big.write(Buffer.alloc(64 * 1024, 1));
      await new Promise((r) => setTimeout(r, 500));
      big.destroy();
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
    const dir = path.join(scratch, "made");
    assert.deepEqual(makeCerts(dir, [HOST, "other.example.test"], "made"), { ok: true, why: "" });
    const text = execFileSync("openssl", ["x509", "-in", path.join(dir, "leaf.pem"), "-noout", "-text"], { encoding: "utf8" });
    assert.match(text, /DNS:login\.example\.test, DNS:other\.example\.test/);
    const failing: System = { ...system, run: () => ({ status: 1, stdout: "", stderr: ` ${"no openssl ".repeat(30)}` }) };
    const bad = makeCerts(path.join(scratch, "unmade"), [HOST], "unmade", failing);
    assert.equal(bad.ok, false);
    assert.equal(bad.why.length, 200);
  });

  test("the judge: a silent sign-in held for ever with no way in fails, and one that gives way in time passes", () => {
    const ev = (e: string, at: number, prompt: string | null, p = "/organizations/oauth2/v2.0/authorize"): StandInEvent & { at: number } => ({ ev: e as "held", t: at, at, host: HOST, method: "GET", path: p, prompt });
    const stuck = judgeHeld([ev("held", 9000, "none")], HOLD, 45_000);
    assert.deepEqual(stuck, { ok: false, evidence: "1 silent sign-in held unanswered, the first at 9 s; the app never asked for the sign-in page in the open after it, so the silent sign-in never ended and there was no way in" });
    const gaveWay = judgeHeld([ev("passed", 1000, "select_account"), ev("held", 9000, "none"), ev("passed", 10_000, null, "/other"), ev("held", 22_000, "none"), ev("passed", 32_500, "select_account")], HOLD, 45_000);
    assert.deepEqual(gaveWay, { ok: true, evidence: "2 silent sign-ins held unanswered, the first at 9 s; the app asked for the sign-in page in the open 23.5 s later (the limit is 45 s)" });
    assert.equal(judgeHeld([ev("held", 9000, "none"), ev("failed", 54_000, "select_account")], HOLD, 45_000).ok, true, "a failed ask is still an ask, at the limit");
    assert.equal(judgeHeld([ev("held", 9000, "none"), ev("passed", 80_000, "select_account")], HOLD, 45_000).ok, false, "too late");
    assert.deepEqual(judgeHeld([], HOLD, 45_000), { ok: false, evidence: "the stand-in never held a silent sign-in, so this run proves nothing about a managed Mac" });
  });

  describe("on a made-up Mac", () => {
    /** Apple's networking, trusting the authority the stand-in made in `dir`. */
    const apple = (dir: string) => ({ ca: fs.readFileSync(path.join(dir, "ca.pem")), ALPNProtocols: ["h2", "http/1.1"] }) as https.RequestOptions;
    /** A Mac whose security, hosts and DNS commands answer as `say` says; openssl runs for real; osascript reads through the stand-in. */
    const mac = (port: number, dir: string, say: Partial<Record<"trust" | "verify" | "tee" | "resolve" | "read", boolean>> = {}) => {
      const ran: string[] = [];
      const sys: System = {
        ...system,
        run(cmd, args, o) {
          ran.push([cmd, ...args].join(" "));
          if (cmd === "openssl") return system.run(cmd, args, o);
          const answer = (ok: boolean | undefined, stdout = "") => ({ status: ok === false ? 1 : 0, stdout, stderr: ok === false ? "refused" : "" });
          if (cmd === "sudo" && args[1] === "security" && args[2] === "add-trusted-cert") return answer(say.trust);
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
      const t0 = Date.now();
      const s = await ssoExtension({ hosts: [HOST], hold: { path: "^/held$" } }, dir, () => Date.now() - t0, log, { sys, platform: "darwin", hostsFile, port, upstream: { [HOST]: ["127.0.0.1"] }, upstreamPort, ca: path.join(certs.real, "ca.pem") });
      try {
        assert.equal(s.ok, true, s.evidence);
        assert.equal(s.evidence, `the SSO extension's stand-in takes ${HOST} (pointed at it, its certificate trusted for the run, and a read through Apple's networking reached it) and holds ^/held$ unanswered`);
        assert.equal(fs.readFileSync(hostsFile, "utf8"), `127.0.0.1 localhost\n# ouro first-run: SSO extension stand-in\n127.0.0.1 ${HOST}\n::1 ${HOST}\n`);
        assert.equal(await ask(port, "/held", apple(dir)), "no answer");
        assert.deepEqual(s.events().map((e) => e.ev), ["ready", "passed", "held"]);
        assert.ok(s.events().every((e) => e.at >= 0 && e.at < 60_000), "on the session's clock");
        assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l).ev), ["ready", "passed", "held"]);
      } finally {
        s.lift();
      }
      assert.equal(fs.readFileSync(hostsFile, "utf8"), "127.0.0.1 localhost");
      assert.ok(!fs.existsSync(path.join(dir, "ca.key")) && !fs.existsSync(path.join(dir, "leaf.key")), "its keys are gone");
      assert.ok(ran.some((r) => r.startsWith("sudo -n security remove-trusted-cert -d ")) && ran.some((r) => r.startsWith("sudo -n security delete-certificate -c Ouro first-run SSO stand-in ")));
      assert.ok(ran.includes("sudo -n dscacheutil -flushcache") && ran.includes("sudo -n killall -HUP mDNSResponder"));
      let stopped = "";
      for (let i = 0; i < 50 && !stopped.includes("ECONNREFUSED"); i++) stopped = await ask(port, "/");
      assert.equal(stopped, `error: connect ECONNREFUSED 127.0.0.1:${port}`, "the stand-in has stopped");
    });

    test("says why it can't play the extension, and changes nothing it didn't put back", async () => {
      const hostsFile = path.join(scratch, "hosts-unplayed");
      const run = async (say: Parameters<typeof mac>[2], platform = "darwin", hosts = [HOST]) => {
        fs.writeFileSync(hostsFile, "127.0.0.1 localhost\n");
        const port = await freePort();
        const dir = path.join(scratch, `unplayed-${port}`);
        const { sys } = mac(port, dir, say);
        const s = await ssoExtension({ hosts, hold: HOLD }, dir, () => 0, undefined, { sys, platform, hostsFile, port, upstream: { [HOST]: ["127.0.0.1"] }, upstreamPort, ca: path.join(certs.real, "ca.pem") });
        s.lift();
        assert.equal(s.ok, false);
        assert.equal(fs.readFileSync(hostsFile, "utf8"), "127.0.0.1 localhost\n");
        return s.evidence;
      };
      assert.equal(await run({}, "linux"), "no SSO extension stand-in: it plays a Mac's extension, and this isn't a Mac");
      assert.match(await run({ verify: false }), /^no SSO extension stand-in: the system doesn't trust its certificate \(add-trusted-cert: no message\); run it where sudo -n works, as on a CI runner$/);
      assert.match(await run({ verify: false, trust: false }), /\(add-trusted-cert: refused\)/);
      assert.equal(await run({ tee: false }), "no SSO extension stand-in: it couldn't point the hosts at the stand-in (sudo -n tee /etc/hosts)");
      assert.equal(await run({ resolve: false }), `no SSO extension stand-in: ${HOST} don't resolve to the stand-in after /etc/hosts and a flush`);
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
      const refused = await ssoExtension({ hosts: [HOST], hold: HOLD }, path.join(scratch, "busy"), () => 0, undefined, { sys, platform: "darwin", hostsFile, port: busy, upstream: { [HOST]: ["127.0.0.1"] } });
      taken.close();
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
      assert.equal(d.id, "managed-mac");
      await d.before!(session);
      assert.equal(await ask(port, "/common/oauth2/v2.0/authorize?prompt=none", apple(dir)), "no answer");
      assert.equal(await ask(port, "/common/oauth2/v2.0/authorize?prompt=select_account", apple(dir)), "real /common/oauth2/v2.0/authorize?prompt=select_account");
      d.end(session);
      assert.deepEqual(steps.map(([n, ok]) => [n, ok]), [["sso-extension", true], ["sso-extension-held", true]]);
      assert.match(steps[1]![2], /^1 silent sign-in held unanswered, the first at [\d.]+ s; the app asked for the sign-in page in the open [\d.]+ s later \(the limit is 20 s\)$/);
      assert.deepEqual(notes.map(([e]) => e), ["sso-stand-in passed", "sso-stand-in held", "sso-stand-in passed"]);
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
