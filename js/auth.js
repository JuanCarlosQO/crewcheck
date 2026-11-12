// Crew access: 4-digit code and fingerprint (WebAuthn platform authenticator).
// Pure functions with no access to the page, so they can be tested with Node
// (see tests/auth.test.mjs). The browser side lives in js/gate.js.
//
// What this protects, honestly: it is a lock on this device, like a phone's
// lock screen. The code is never stored, only a salted PBKDF2 hash of it, and
// the fingerprint never leaves the device: the browser only hands back a
// signature that we check against the public key saved when it was set up.
// The health log itself is not encrypted (it lives in the browser's storage).

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export const PIN_LENGTH = 4;
// OWASP's figure for PBKDF2-HMAC-SHA256. With only 10 000 possible codes the
// hash slows a thief down but cannot stop one who copies the storage; the
// wrong-try lockout below is what protects the code in normal use.
export const PBKDF2_ITERATIONS = 600000;
export const FREE_TRIES = 5;

/* ---------- Bytes ---------- */

export function toB64url(bytes) {
  const b = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------- Code (PIN) ---------- */

/** Why a code cannot be used, or null if it is fine. */
export function pinProblem(pin) {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `Use exactly ${PIN_LENGTH} digits.`;
  if (/^(\d)\1+$/.test(pin)) return "All four digits are the same. Pick a code that is harder to guess.";
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return "A straight run like 1234 is the first code anyone tries. Pick another.";
  return null;
}

async function derive(pin, salt, iterations) {
  const key = await subtle().importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** A record safe to store: salt, iterations and hash. Never the code itself. */
export async function createPinRecord(pin, iterations = PBKDF2_ITERATIONS) {
  const problem = pinProblem(pin);
  if (problem) throw new Error(problem);
  const salt = randomBytes(16);
  return { v: 1, salt: toB64url(salt), iterations, hash: toB64url(await derive(pin, salt, iterations)) };
}

export async function checkPin(pin, record) {
  if (!record || typeof pin !== "string") return false;
  const got = await derive(pin, fromB64url(record.salt), record.iterations);
  return sameBytes(got, fromB64url(record.hash));
}

/* ---------- Wrong tries ---------- */

/** After FREE_TRIES wrong codes, wait 30 s, then double the wait for each further miss (max 15 min). */
export function lockoutMs(failures) {
  if (failures < FREE_TRIES) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** (failures - FREE_TRIES));
}

export function triesLeft(failures) {
  return Math.max(0, FREE_TRIES - failures);
}

/* ---------- Fingerprint (WebAuthn) ---------- */

/** Reads the flags and counter from WebAuthn authenticator data. */
export function parseAuthData(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 37) throw new Error("Authenticator data is too short.");
  const flags = b[32];
  return {
    rpIdHash: b.slice(0, 32),
    userPresent: Boolean(flags & 0x01),
    userVerified: Boolean(flags & 0x04),
    signCount: ((b[33] << 24) >>> 0) + (b[34] << 16) + (b[35] << 8) + b[36],
  };
}

/** WebAuthn ES256 signatures are DER encoded; WebCrypto wants raw r‖s. */
export function derToRaw(der, size = 32) {
  const b = der instanceof Uint8Array ? der : new Uint8Array(der);
  if (b[0] !== 0x30) throw new Error("Not a DER signature.");
  let i = 2;
  if (b[1] & 0x80) i = 2 + (b[1] & 0x7f);
  const read = () => {
    if (b[i] !== 0x02) throw new Error("Bad DER integer.");
    const len = b[i + 1];
    let v = b.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = read(), s = read();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

const ALGS = {
  [-7]: { importAs: { name: "ECDSA", namedCurve: "P-256" }, verifyAs: { name: "ECDSA", hash: "SHA-256" }, der: true },
  [-257]: { importAs: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verifyAs: { name: "RSASSA-PKCS1-v1_5" }, der: false },
};

/**
 * Check a WebAuthn assertion the way a server would, but on the device.
 * @param a  { authenticatorData, clientDataJSON, signature } as bytes
 * @param expect { challenge (bytes), origin, rpId, publicKey (SPKI b64url) | null, alg }
 * @returns { ok, reason, signCount }
 */
export async function verifyAssertion(a, expect) {
  const fail = (reason) => ({ ok: false, reason });
  let client;
  try { client = JSON.parse(new TextDecoder().decode(a.clientDataJSON)); } catch { return fail("Unreadable client data."); }
  if (client.type !== "webauthn.get") return fail("Wrong ceremony type.");
  if (!sameBytes(fromB64url(client.challenge), expect.challenge)) return fail("Challenge does not match.");
  if (client.origin !== expect.origin) return fail("Wrong origin.");

  const auth = parseAuthData(a.authenticatorData);
  const rpHash = new Uint8Array(await subtle().digest("SHA-256", enc.encode(expect.rpId)));
  if (!sameBytes(auth.rpIdHash, rpHash)) return fail("Wrong site.");
  if (!auth.userPresent) return fail("No touch detected.");
  if (!auth.userVerified) return fail("The device did not verify the fingerprint.");

  // Some older browsers cannot export the public key at set-up. Then the
  // checks above (origin, challenge, verified flag) are all we can do.
  if (!expect.publicKey) return { ok: true, reason: "Verified (no stored key to check the signature).", signCount: auth.signCount };
  const alg = ALGS[expect.alg ?? -7];
  if (!alg) return fail("Unsupported key type.");
  const key = await subtle().importKey("spki", fromB64url(expect.publicKey), alg.importAs, false, ["verify"]);
  const clientHash = new Uint8Array(await subtle().digest("SHA-256", a.clientDataJSON));
  const signed = new Uint8Array(a.authenticatorData.byteLength + clientHash.length);
  signed.set(new Uint8Array(a.authenticatorData), 0);
  signed.set(clientHash, a.authenticatorData.byteLength);
  const sig = alg.der ? derToRaw(new Uint8Array(a.signature)) : new Uint8Array(a.signature);
  const good = await subtle().verify(alg.verifyAs, key, sig, signed);
  return good ? { ok: true, reason: "Verified.", signCount: auth.signCount } : fail("Signature does not match.");
}
