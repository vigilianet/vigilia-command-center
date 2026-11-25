import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { PageHeader, StatusDot, fmtDate } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { addProvider, deleteProvider, testProvider, toggleProvider, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/providers")({
  head: () => pageHead("Fournisseurs IA", "Routage multi-fournisseurs, quotas, circuit breaker et bascule automatique."),
  component: () => <AppShell>{(w, refresh) => <ProvidersView w={w} refresh={refresh} />}</AppShell>,
});

function ProvidersView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const doAdd = useServerFn(addProvider);
  const doTest = useServerFn(testProvider);
  const doToggle = useServerFn(toggleProvider);
  const doDel = useServerFn(deleteProvider);

  const [open, setOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"openai" | "gemini" | "anthropic" | "openrouter">("openai");
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [fallback, setFallback] = useState("");
  const [secret, setSecret] = useState("");
  const [priority, setPriority] = useState(10);
  const [limit, setLimit] = useState(1000000);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await doAdd({
        data: { provider, label, model_default: model, fallback_model: fallback.trim() || null, secret: secret.trim(), shared_quota_group: null, priority: Number(priority), monthly_token_limit: Number(limit) },
      });
      toast.success("Fournisseur ajouté (désactivé jusqu'au premier test réussi).");
      setLabel(""); setSecret(""); setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'ajout");
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      await doTest({ data: { id } });
      toast.success("Fournisseur testé et activé.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test échoué");
    } finally { setTestingId(null); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Fournisseurs IA & Bascule" sub="Ordre de priorité, suivi des jetons et circuit breaker automatique (pas de bascule sur erreur de prompt).">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 size-4" />Ajouter une clé IA</Button>
      </PageHeader>

      <div className="space-y-3">
        {w.providers.map((p) => {
          const pct = Math.min(100, Math.round((p.tokens_used / Math.max(1, p.monthly_token_limit)) * 100));
          return (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <StatusDot status={p.enabled ? p.status : "disabled"} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        <span>{p.label}</span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">P{p.priority} · {p.provider}</span>
                        {p.key_fingerprint && <span className="font-mono text-xs text-muted-foreground">{p.key_fingerprint}</span>}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        Modèle : {p.model_default}{p.fallback_model ? ` → ${p.fallback_model}` : ""} · {p.requests_count} req. / {p.errors_count} err.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={testingId === p.id} onClick={() => handleTest(p.id)}>
                      <Play className="mr-1 size-3.5" />{testingId === p.id ? "Test…" : "Tester"}
                    </Button>
                    <Switch checked={p.enabled} onCheckedChange={async (v) => { await doToggle({ data: { id: p.id, enabled: v } }); refresh(); }} aria-label={`Activer ${p.label}`} />
                    {p.provider !== "lovable_gateway" && (
                      <Button size="sm" variant="ghost" onClick={async () => { await doDel({ data: { id: p.id } }); toast.success("Clé supprimée."); refresh(); }} className="text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                    <span>Quota mensuel : {p.tokens_used.toLocaleString("fr-FR")} / {p.monthly_token_limit.toLocaleString("fr-FR")} jetons</span>
                    <span>{pct}% · Dernier usage : {fmtDate(p.last_used_at)}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
                {p.last_error_message && <p className="text-xs text-destructive">{p.last_error_message}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Historique des bascules IA ({w.failovers.length})</CardTitle></CardHeader>
        <CardContent>
          {w.failovers.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Aucune erreur ou bascule fournisseur enregistrée.</p>
          ) : (
            <div className="divide-y divide-border text-xs">
              {w.failovers.slice(0, 15).map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-warning">{f.error_type}</span>
                  <span className="flex-1 truncate text-muted-foreground">{f.message}</span>
                  <span className="font-mono">{f.switched ? "Basculé" : "Arrêté"} · {fmtDate(f.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ajouter un fournisseur IA externe</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Fournisseur</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Priorité (1 = plus haute)</Label><Input type="number" min={1} max={100} value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></div>
            </div>
            <div><Label>Nom / libellé</Label><Input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="OpenAI Secours" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Modèle principal</Label><Input required value={model} onChange={(e) => setModel(e.target.value)} /></div>
              <div><Label>Modèle de secours</Label><Input value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="Optionnel" /></div>
            </div>
            <div><Label>Clé API (chiffrée AES-256-GCM)</Label><Input type="password" required value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
            <div><Label>Limite mensuelle de jetons</Label><Input type="number" min={1000} max={10000000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit">Ajouter</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}