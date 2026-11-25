// SSRF guard: only public http(s) targets on standard ports may be monitored.
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp"];

export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b") || v.startsWith("2001:db8");
}

const isIPv4 = (h: string) => /^\d+\.\d+\.\d+\.\d+$/.test(h);
const isIPv6 = (h: string) => h.includes(":");

async function resolve(host: string, type: "A" | "AAAA"): Promise<string[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) throw new Error("Résolution DNS impossible");
  const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
  const code = type === "A" ? 1 : 28;
  return (json.Answer ?? []).filter((a) => a.type === code).map((a) => a.data);
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("URL invalide"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Seuls http et https sont autorisés");
  if (url.username || url.password) throw new Error("Identifiants dans l'URL interdits");
  if (!ALLOWED_PORTS.has(url.port)) throw new Error("Port non autorisé");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || (!host.includes(".") && !isIPv6(host)) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error("Adresse interne ou privée refusée");
  }
  if (isIPv4(host)) { if (isPrivateIPv4(host)) throw new Error("Adresse IP privée refusée"); return url; }
  if (isIPv6(host)) { if (isPrivateIPv6(host)) throw new Error("Adresse IP privée refusée"); return url; }
  const [a, aaaa] = await Promise.all([resolve(host, "A"), resolve(host, "AAAA").catch(() => [])]);
  if (a.length + aaaa.length === 0) throw new Error("Domaine introuvable (DNS)");
  if (a.some(isPrivateIPv4) || aaaa.some(isPrivateIPv6)) throw new Error("Le domaine pointe vers une adresse privée");
  return url;
}