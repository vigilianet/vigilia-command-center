// Server-side AES-256-GCM encryption (Web Crypto API — Cloudflare Workers compatible)
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
  /sb_secret_[a-zA-Z0-9_-]{16,}/g,
  /eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}/g,
  /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, // Telegram bot tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, "[SECRET_MASQUÉ]");
  }
  return out;
}

export function fingerprintSecret(secret: string): string {
  const clean = secret.trim();
  if (clean.length <= 6) return "••••";
  return `${clean.slice(0, 3)}…${clean.slice(-4)}`;
}

async function deriveAesKey(rawKey?: string): Promise<CryptoKey> {
  const material = rawKey ?? process.env["VIGILIA_ENCRYPTION_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!material) throw new Error("Clé de chiffrement serveur indisponible");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(plaintext: string, rawKey?: string): Promise<string> {
  const key = await deriveAesKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(ciphertext: string, rawKey?: string): Promise<string> {
  const [ver, ivB64, dataB64] = ciphertext.split(":");
  if (ver !== "v1" || !ivB64 || !dataB64) throw new Error("Format de secret chiffré invalide");
  const key = await deriveAesKey(rawKey);
  const iv = fromBase64(ivB64);
  const data = fromBase64(dataB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return new TextDecoder().decode(decrypted);
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toBase64(new Uint8Array(digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}