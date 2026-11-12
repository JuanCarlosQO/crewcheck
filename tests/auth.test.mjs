import { test } from "node:test";
import assert from "node:assert/strict";
import { pinProblem, createPinRecord, checkPin, lockoutMs, triesLeft, parseAuthData, derToRaw, verifyAssertion, toB64url, fromB64url } from "../js/auth.js";

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();

test("code rules: four digits, not all the same, not a straight run", () => {
  assert.equal(pinProblem("4719"), null);
  assert.equal(pinProblem("0420"), null);
  assert.match(pinProblem("123"), /exactly 4/);
  assert.match(pinProblem("12a4"), /exactly 4/);
  assert.match(pinProblem("7777"), /same/);
  assert.match(pinProblem("1234"), /straight run/);
  assert.match(pinProblem("6543"), /straight run/);
  assert.equal(pinProblem("1235"), null);
});

test("the stored record never contains the code and checks it", async () => {
  const rec = await createPinRecord("4719", 1000);
  assert.ok(!JSON.stringify(rec).includes("4719"));
  assert.equal(await checkPin("4719", rec), true);
  assert.equal(await checkPin("4718", rec), false);
  assert.equal(await checkPin("4719", null), false);
});

test("two records for the same code use different salts", async () => {
  const a = await createPinRecord("4719", 1000), b = await createPinRecord("4719", 1000);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test("weak codes are refused when creating a record", async () => {
  await assert.rejects(createPinRecord("0000", 1000), /same/);
});

test("wrong-try lockout: free tries, then 30 s doubling, capped at 15 min", () => {
  assert.equal(lockoutMs(0), 0);
  assert.equal(lockoutMs(4), 0);
  assert.equal(lockoutMs(5), 30_000);
  assert.equal(lockoutMs(6), 60_000);
  assert.equal(lockoutMs(20), 15 * 60_000);
  assert.equal(triesLeft(3), 2);
  assert.equal(triesLeft(9), 0);
});

test("base64url round trip", () => {
  const b = Uint8Array.from([0, 251, 255, 62, 63, 1, 2]);
  assert.deepEqual(fromB64url(toB64url(b)), b);
  assert.ok(!/[+/=]/.test(toB64url(b)));
});

test("authenticator data flags", () => {
  const d = new Uint8Array(37);
  d[32] = 0x05; d[36] = 7;
  const p = parseAuthData(d);
  assert.equal(p.userPresent, true);
  assert.equal(p.userVerified, true);
  assert.equal(p.signCount, 7);
  d[32] = 0x01;
  assert.equal(parseAuthData(d).userVerified, false);
});

// Build a WebAuthn-like assertion with a real P-256 key, the way a phone would.
function rawToDer(raw) {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; let v = b.slice(i); if (v[0] & 0x80) v = Uint8Array.of(0, ...v); return Uint8Array.of(0x02, v.length, ...v); };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32));
  return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
}

async function fakeDevice({ rpId = "crew.example", origin = "https://crew.example", flags = 0x05, type = "webauthn.get" } = {}) {
  const keys = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = toB64url(await subtle.exportKey("spki", keys.publicKey));
  const sign = async (challenge, over = {}) => {
    const authenticatorData = new Uint8Array(37);
    authenticatorData.set(new Uint8Array(await subtle.digest("SHA-256", enc.encode(over.rpId ?? rpId))), 0);
    authenticatorData[32] = over.flags ?? flags;
    authenticatorData[36] = 1;
    const clientDataJSON = enc.encode(JSON.stringify({ type: over.type ?? type, challenge: toB64url(challenge), origin: over.origin ?? origin }));
    const hash = new Uint8Array(await subtle.digest("SHA-256", clientDataJSON));
    const msg = new Uint8Array([...authenticatorData, ...hash]);
    const raw = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, msg));
    return { authenticatorData, clientDataJSON, signature: rawToDer(raw) };
  };
  return { publicKey, sign };
}

test("DER signature converts back to raw r‖s", () => {
  const raw = Uint8Array.from({ length: 64 }, (_, i) => (i === 0 || i === 32 ? 0x80 : i));
  assert.deepEqual(derToRaw(rawToDer(raw)), raw);
  const small = new Uint8Array(64); small[31] = 5; small[63] = 9;
  assert.deepEqual(derToRaw(rawToDer(small)), small);
});

test("a genuine fingerprint assertion is accepted", async () => {
  const dev = await fakeDevice();
  const challenge = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const r = await verifyAssertion(await dev.sign(challenge), { challenge, origin: "https://crew.example", rpId: "crew.example", publicKey: dev.publicKey, alg: -7 });
  assert.equal(r.ok, true, r.reason);
});

test("fingerprint assertions are refused when anything is off", async () => {
  const dev = await fakeDevice();
  const other = await fakeDevice();
  const challenge = Uint8Array.from([9, 9, 9, 9]);
  const expect = { challenge, origin: "https://crew.example", rpId: "crew.example", publicKey: dev.publicKey, alg: -7 };
  const no = async (assertion, why) => { const r = await verifyAssertion(assertion, expect); assert.equal(r.ok, false); assert.match(r.reason, why); };
  await no(await dev.sign(Uint8Array.from([1])), /Challenge/);
  await no(await dev.sign(challenge, { origin: "https://evil.example" }), /origin/);
  await no(await dev.sign(challenge, { rpId: "evil.example" }), /site/);
  await no(await dev.sign(challenge, { flags: 0x01 }), /did not verify/);
  await no(await dev.sign(challenge, { type: "webauthn.create" }), /ceremony/);
  await no(await other.sign(challenge), /Signature/);
});
