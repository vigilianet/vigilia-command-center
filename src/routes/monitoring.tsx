import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { ENV_LABEL, IncidentStatus, PageHeader, SeverityBadge, StatusDot, fmtDate, fmtDuration } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { deleteRecord, setIncidentStatus } from "@/lib/workspace/integrations.functions";
import { checkMonitor, saveRecord, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/monitoring")({
  head: () => pageHead("Surveillance", "Contrôles HTTP réels protégés SSRF, planification périodique et suivi d'incidents."),
  component: () => <AppShell>{(w, refresh) => <MonitoringView w={w} refresh={refresh} />}</AppShell>,
});

type MonForm = { id?: string; name: string; url: string; project_id: string; environment: "production" | "staging" | "development"; http_method: "GET" | "HEAD"; expected_status: number; expected_keyword: string; interval_minutes: 1 | 5 | 10 | 15 | 30 | 60; timeout_ms: number; enabled: boolean };
const emptyMon = (): MonForm => ({ name: "", url: "https://", project_id: "none", environment: "production", http_method: "GET", expected_status: 200, expected_keyword: "", interval_minutes: 5, timeout_ms: 10000, enabled: true });

function MonitoringView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const save = useServerFn(saveRecord);
  const del = useServerFn(deleteRecord);
  const runCheck = useServerFn(checkMonitor);
  const setInc = useServerFn(setIncidentStatus);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [form, setForm] = useState<MonForm>(emptyMon());

  function openEdit(m: Workspace["monitors"][number]) {
    setForm({
      id: m.id, name: m.name, url: m.url, project_id: m.project_id ?? "none",
      environment: m.environment as MonForm["environment"], http_method: (m.http_method === "HEAD" ? "HEAD" : "GET"),
      expected_status: m.expected_status, expected_keyword: m.expected_keyword ?? "",
      interval_minutes: ([1, 5, 10, 15, 30, 60].includes(m.interval_minutes) ? m.interval_minutes : 5) as MonForm["interval_minutes"],
      timeout_ms: m.timeout_ms, enabled: m.enabled,
    });
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        data: {
          kind: "monitor", ...(form.id ? { id: form.id } : {}),
          values: {
            name: form.name, url: form.url, project_id: form.project_id === "none" ? null : form.project_id,
            environment: form.environment, http_method: form.http_method, expected_status: Number(form.expected_status),
            expected_keyword: form.expected_keyword.trim() || null, interval_minutes: form.interval_minutes,
            timeout_ms: Number(form.timeout_ms), enabled: form.enabled,
          },
        },
      });
      toast.success(form.id ? "Contrôle mis à jour." : "Contrôle ajouté.");
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "URL refusée ou invalide");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheck(id: string) {
    setCheckingId(id);
    try {
      const r = await runCheck({ data: { id } });
      toast[r.ok ? "success" : "error"](r.ok ? `OK — HTTP ${r.status_code} (${r.response_ms} ms)` : r.error ?? "En panne");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de contrôle");
    } finally {
      setCheckingId(null);
    }
  }

  async function handleIncStatus(id: string, status: "open" | "in_progress" | "resolved") {
    try {
      await setInc({ data: { id, status } });
      toast.success("Statut d'incident mis à jour.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function handleDelete(id: string) {
    try {
      await del({ data: { kind: "monitor", id } });
      toast.success("Contrôle supprimé.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  const openIncCount = w.incidents.filter((i) => i.status !== "resolved").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Surveillance & Incidents" sub="Contrôles HTTP publics protégés contre les requêtes internes (SSRF), vérifiés périodiquement.">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
            <Clock className="size-3.5" />Planification active
          </span>
          <Button size="sm" onClick={() => { setForm(emptyMon()); setOpen(true); }}><Plus className="mr-1.5 size-4" />Nouveau contrôle</Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="monitors">
        <TabsList>
          <TabsTrigger value="monitors">Contrôles ({w.monitors.length})</TabsTrigger>
          <TabsTrigger value="incidents">Incidents ({openIncCount} ouvert(s))</TabsTrigger>
        </TabsList>

        <TabsContent value="monitors" className="mt-4 space-y-3">
          {w.monitors.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucun contrôle HTTP configuré.</CardContent></Card>
          ) : (
            w.monitors.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="pt-1"><StatusDot status={m.enabled ? m.last_status : "disabled"} /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{m.http_method} {m.expected_status}</span>
                        <span className="text-xs text-muted-foreground">{ENV_LABEL[m.environment] ?? m.environment} · toutes les {m.interval_minutes} min</span>
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">{m.url}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Dernier contrôle : {fmtDate(m.last_checked_at)} {m.last_response_ms != null ? `· ${m.last_response_ms} ms` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" disabled={checkingId === m.id} onClick={() => handleCheck(m.id)}>
                      <Play className="mr-1 size-3.5" />{checkingId === m.id ? "Test…" : "Vérifier"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Pencil className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)} className="text-destructive"><Trash2 className="size-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="incidents" className="mt-4 space-y-3">
          {w.incidents.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucun incident détecté.</CardContent></Card>
          ) : (
            w.incidents.map((inc) => (
              <Card key={inc.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2"><SeverityBadge s={inc.severity} /><IncidentStatus s={inc.status} /><span className="text-xs text-muted-foreground">Durée : {fmtDuration(inc.started_at, inc.resolved_at)}</span></div>
                    <div className="font-medium">{inc.title}</div>
                    {inc.description && <p className="text-xs text-muted-foreground">{inc.description}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    {inc.status !== "in_progress" && inc.status !== "resolved" && (
                      <Button size="sm" variant="outline" onClick={() => handleIncStatus(inc.id, "in_progress")}>Prendre en charge</Button>
                    )}
                    {inc.status !== "resolved" ? (
                      <Button size="sm" onClick={() => handleIncStatus(inc.id, "resolved")}>Résoudre</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => handleIncStatus(inc.id, "open")}>Rouvrir</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Modifier le contrôle" : "Nouveau contrôle HTTP"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div><Label>Nom</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="API Production" /></div>
            <div><Label>URL publique (http/https)</Label><Input type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Méthode</Label>
                <Select value={form.http_method} onValueChange={(v) => setForm({ ...form, http_method: v as "GET" | "HEAD" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="HEAD">HEAD</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Statut attendu</Label><Input type="number" min={100} max={599} value={form.expected_status} onChange={(e) => setForm({ ...form, expected_status: Number(e.target.value) })} /></div>
              <div>
                <Label>Intervalle (min)</Label>
                <Select value={String(form.interval_minutes)} onValueChange={(v) => setForm({ ...form, interval_minutes: Number(v) as MonForm["interval_minutes"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 5, 10, 15, 30, 60].map((n) => <SelectItem key={n} value={String(n)}>{n} min</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Mot-clé attendu (optionnel)</Label><Input value={form.expected_keyword} onChange={(e) => setForm({ ...form, expected_keyword: e.target.value })} placeholder="ok" /></div>
              <div><Label>Timeout (ms)</Label><Input type="number" min={1000} max={30000} value={form.timeout_ms} onChange={(e) => setForm({ ...form, timeout_ms: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label>Contrôle actif</Label>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={busy}>{busy ? "Validation…" : "Enregistrer"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}