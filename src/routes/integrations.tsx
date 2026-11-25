import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, GitBranch, MessageSquare, RefreshCw, Search, Send, Unplug } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { IntegrationStatusBadge, PageHeader, fmtDate } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { connectGithub, connectTelegram, disconnectIntegration, disconnectTelegram, inspectRepo, testIntegration, testTelegram, updateTelegramPrefs } from "@/lib/workspace/integrations.functions";
import type { Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/integrations")({
  head: () => pageHead("Intégrations", "Connectez GitHub et Telegram avec chiffrement serveur AES-256-GCM."),
  component: () => <AppShell>{(w, refresh) => <IntegrationsView w={w} refresh={refresh} />}</AppShell>,
});

function IntegrationsView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const doGh = useServerFn(connectGithub);
  const doTest = useServerFn(testIntegration);
  const doDisGh = useServerFn(disconnectIntegration);
  const doInspect = useServerFn(inspectRepo);
  const doTg = useServerFn(connectTelegram);
  const doTgPrefs = useServerFn(updateTelegramPrefs);
  const doTgTest = useServerFn(testTelegram);
  const doDisTg = useServerFn(disconnectTelegram);

  const [ghToken, setGhToken] = useState("");
  const [repoSlug, setRepoSlug] = useState("Landry-kayoyo/vigilia-command-center-98e3812d");
  const [repoRes, setRepoRes] = useState<Awaited<ReturnType<typeof inspectRepo>> | null>(null);
  const [tgToken, setTgToken] = useState("");
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const gh = w.integrations.find((i) => i.provider === "github");
  const tg = w.telegram;

  async function handleConnectGh(e: React.FormEvent) {
    e.preventDefault();
    setBusy("gh");
    try {
      const r = await doGh({ data: { token: ghToken.trim() } });
      setGhToken("");
      toast.success(`GitHub connecté (${r.login ?? "OK"}).`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec GitHub");
    } finally { setBusy(null); }
  }

  async function handleInspect(e: React.FormEvent) {
    e.preventDefault();
    setBusy("inspect");
    try {
      const r = await doInspect({ data: { repo: repoSlug } });
      setRepoRes(r);
      toast.success(`Dépôt ${r.name} inspecté (${r.file_count} fichiers).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inspection impossible");
    } finally { setBusy(null); }
  }

  async function handleConnectTg(e: React.FormEvent) {
    e.preventDefault();
    setBusy("tg");
    try {
      const r = await doTg({ data: { token: tgToken.trim() } });
      setTgToken("");
      setTgCode(r.code);
      toast.success(r.webhook ? `Bot @${r.bot} configuré. Envoyez le code au bot.` : `Bot validé, erreur webhook : ${r.error}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec Telegram");
    } finally { setBusy(null); }
  }

  async function togglePref(field: "notify_incidents" | "notify_missions" | "notify_approvals", value: boolean) {
    if (!tg) return;
    try {
      await doTgPrefs({ data: { notify_incidents: tg.notify_incidents, notify_missions: tg.notify_missions, notify_approvals: tg.notify_approvals, [field]: value } });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Intégrations" sub="Les jetons sont chiffrés côté serveur (AES-256-GCM) et jamais renvoyés au navigateur." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base"><GitBranch className="size-4 text-primary" />GitHub</CardTitle>
              <IntegrationStatusBadge status={gh?.status ?? "not_configured"} />
            </div>
            <CardDescription>Inspection de dépôts privés et création de branches approuvées (branches protégées bloquées).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {gh && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 p-3 text-xs">
                <div>
                  <div>Compte : <strong className="font-mono">{String((gh.config as Record<string, unknown>)?.["login"] ?? "—")}</strong></div>
                  <div className="text-muted-foreground">Testé : {fmtDate(gh.last_tested_at)}</div>
                  {gh.last_error && <div className="text-destructive">{gh.last_error}</div>}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" disabled={busy === "test-gh"} onClick={async () => {
                    setBusy("test-gh");
                    try { await doTest({ data: { id: gh.id } }); toast.success("Connexion GitHub valide."); refresh(); }
                    catch (err) { toast.error(err instanceof Error ? err.message : "Échec"); }
                    finally { setBusy(null); }
                  }}><RefreshCw className="mr-1 size-3.5" />Tester</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await doDisGh({ data: { id: gh.id } }); toast.success("GitHub déconnecté."); refresh(); }} className="text-destructive"><Unplug className="size-3.5" /></Button>
                </div>
              </div>
            )}
            <form onSubmit={handleConnectGh} className="space-y-2.5">
              <Label htmlFor="gh-tok">Personal Access Token GitHub (fine-grained ou classic)</Label>
              <div className="flex gap-2">
                <Input id="gh-tok" type="password" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="ghp_… ou github_pat_…" />
                <Button type="submit" disabled={busy === "gh" || ghToken.trim().length < 20}>Connecter</Button>
              </div>
            </form>
            <form onSubmit={handleInspect} className="space-y-2 border-t border-border pt-3">
              <Label htmlFor="repo-test">Test rapide de lecture GitHub (public sans jeton, privé avec jeton)</Label>
              <div className="flex gap-2">
                <Input id="repo-test" value={repoSlug} onChange={(e) => setRepoSlug(e.target.value)} placeholder="owner/repo" className="font-mono text-xs" />
                <Button type="submit" variant="outline" disabled={busy === "inspect"}><Search className="mr-1 size-3.5" />Inspecter</Button>
              </div>
              {repoRes && (
                <div className="rounded bg-secondary/40 p-2.5 font-mono text-xs">
                  {repoRes.name} · branche {repoRes.default_branch} · {repoRes.file_count} fichiers · {repoRes.recent_commits.length} commits récents
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4 text-primary" />Telegram</CardTitle>
              <IntegrationStatusBadge status={tg?.verified ? "connected" : tg?.bot_username ? "error" : "not_configured"} />
            </div>
            <CardDescription>Webhook sécurisé par jeton secret, liaison par code unique, alertes et commandes (/status, /mission, /approve).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tg && (
              <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-mono">
                      @{tg.bot_username ?? "bot"} {tg.verified && <CheckCircle2 className="size-3.5 text-success" />}
                    </div>
                    <div className="text-muted-foreground">Webhook : {tg.webhook_active ? "actif" : "inactif"} · Chat : {tg.verified ? `#${tg.chat_id}` : "en attente de vérification"}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={!tg.verified || busy === "tg-test"} onClick={async () => {
                      setBusy("tg-test");
                      try { await doTgTest(); toast.success("Notification Telegram envoyée."); }
                      catch (err) { toast.error(err instanceof Error ? err.message : "Échec d'envoi"); }
                      finally { setBusy(null); }
                    }}><Send className="mr-1 size-3.5" />Tester</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await doDisTg(); setTgCode(null); toast.success("Telegram déconnecté."); refresh(); }} className="text-destructive"><Unplug className="size-3.5" /></Button>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border pt-2">
                  <div className="flex items-center justify-between"><span>Alertes incidents</span><Switch checked={tg.notify_incidents} onCheckedChange={(v) => togglePref("notify_incidents", v)} /></div>
                  <div className="flex items-center justify-between"><span>Rapports de missions</span><Switch checked={tg.notify_missions} onCheckedChange={(v) => togglePref("notify_missions", v)} /></div>
                  <div className="flex items-center justify-between"><span>Demandes d'approbation</span><Switch checked={tg.notify_approvals} onCheckedChange={(v) => togglePref("notify_approvals", v)} /></div>
                </div>
              </div>
            )}
            {tgCode && (
              <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-xs">
                Envoyez ce code à votre bot Telegram dans les 15 minutes pour lier votre chat : <strong className="font-mono text-sm text-primary">{tgCode}</strong>
              </div>
            )}
            <form onSubmit={handleConnectTg} className="space-y-2.5">
              <Label htmlFor="tg-tok">Jeton BotFather Telegram</Label>
              <div className="flex gap-2">
                <Input id="tg-tok" type="password" value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder="123456789:AA…" />
                <Button type="submit" disabled={busy === "tg" || tgToken.trim().length < 30}>Configurer</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}