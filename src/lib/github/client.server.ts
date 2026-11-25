import { decryptSecret } from "@/lib/crypto.server";

const PROTECTED_BRANCHES = new Set(["main", "master", "production", "prod"]);

export function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.has(branch.trim().toLowerCase());
}

export function parseRepoSlug(raw: string): string {
  const cleaned = raw.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/$/g, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
    throw new Error("Format de dépôt attendu : propriétaire/dépôt");
  }
  return cleaned;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOwnerGithubToken(admin: any, ownerId: string): Promise<string | null> {
  const { data } = await admin
    .from("integrations")
    .select("encrypted_credentials, status")
    .eq("owner_id", ownerId)
    .eq("provider", "github")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  if (!data?.encrypted_credentials) return null;
  try {
    return await decryptSecret(data.encrypted_credentials);
  } catch {
    return null;
  }
}

export async function githubFetch(path: string, token: string | null, init?: RequestInit) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Vigilia-V1.1",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/${path.replace(/^\//, "")}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  return res;
}

export async function inspectGithubRepo(repoSlug: string, token: string | null) {
  const slug = parseRepoSlug(repoSlug);
  const getJson = async (p: string) => {
    const r = await githubFetch(p, token);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub a répondu ${r.status} sur ${p}`);
    return r.json();
  };

  const info = await getJson(`repos/${slug}`);
  if (!info) {
    throw new Error("Dépôt introuvable ou privé (configurez un jeton GitHub dans Intégrations pour les dépôts privés).");
  }

  const [langs, commits, branches, pulls, issues, tree, pkg] = await Promise.all([
    getJson(`repos/${slug}/languages`),
    getJson(`repos/${slug}/commits?per_page=10`),
    getJson(`repos/${slug}/branches?per_page=15`),
    getJson(`repos/${slug}/pulls?state=open&per_page=10`),
    getJson(`repos/${slug}/issues?state=open&per_page=10`),
    getJson(`repos/${slug}/git/trees/${info.default_branch}?recursive=1`),
    getJson(`repos/${slug}/contents/package.json`),
  ]);

  const files: string[] = (tree?.tree ?? [])
    .filter((f: { type: string }) => f.type === "blob")
    .map((f: { path: string }) => f.path);

  const decode = (b?: { content?: string }) => (b?.content ? atob(b.content.replace(/\n/g, "")).slice(0, 4000) : null);

  return {
    name: info.full_name as string,
    private: Boolean(info.private),
    description: (info.description as string | null) ?? null,
    default_branch: info.default_branch as string,
    pushed_at: info.pushed_at as string,
    languages: (langs ?? {}) as Record<string, number>,
    file_count: files.length,
    has_tests: files.some((f) => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[jt]sx?$/.test(f)),
    has_ci: files.some((f) => f.startsWith(".github/workflows/")),
    has_env_committed: files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".example") && !f.endsWith(".sample")),
    branches: ((branches ?? []) as { name: string }[]).map((b) => b.name),
    open_prs: ((pulls ?? []) as { number: number; title: string; state: string }[]).map((p) => ({ number: p.number, title: p.title })),
    open_issues: ((issues ?? []) as { number: number; title: string }[]).slice(0, 10).map((i) => ({ number: i.number, title: i.title })),
    recent_commits: ((commits ?? []) as { sha: string; commit: { message: string; author: { date: string } } }[]).map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0] ?? "",
      date: c.commit.author.date,
    })),
    package_json: decode(pkg),
    sample_files: files.slice(0, 60),
  };
}

export async function executeApprovedGithubBranchCreate(
  token: string,
  repoSlug: string,
  baseBranch: string,
  newBranch: string,
): Promise<{ branch: string; sha: string }> {
  if (isProtectedBranch(newBranch)) {
    throw new Error(`Modification directe de la branche protégée « ${newBranch} » strictement interdite.`);
  }
  const slug = parseRepoSlug(repoSlug);
  const refRes = await githubFetch(`repos/${slug}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token);
  if (!refRes.ok) throw new Error(`Branche de base introuvable (${refRes.status})`);
  const refJson = (await refRes.json()) as { object?: { sha?: string } };
  const sha = refJson.object?.sha;
  if (!sha) throw new Error("SHA de la branche de base introuvable");

  const createRes = await githubFetch(`repos/${slug}/git/refs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Création de branche refusée par GitHub (${createRes.status}): ${errText.slice(0, 200)}`);
  }
  return { branch: newBranch, sha };
}