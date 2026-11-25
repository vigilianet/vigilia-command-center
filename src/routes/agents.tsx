import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { PageHeader, StatusDot } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { deleteRecord } from "@/lib/workspace/integrations.functions";
import { saveRecord, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const ALL_TOOLS = ["project_context", "github_read", "monitoring_read", "incident_read", "memory_read", "audit_read", "integration_check", "prepare_patch", "request_approval"] as const;

export const Route = createFileRoute("/agents")({
  head: () => pageHead("Agents IA", "Configurez Vigilia Lead et votre équipe d'agents spécialistes et leurs permissions."),
  component: () => <AppShell>{(w, refresh) => <AgentsView w={w} refresh={refresh} />}</AppShell>,
});

type AgentItem = Workspace["agents"][number];
type FormState = { id?: string; name: string; role_title: string; specialty: string; instructions: string; skills: string; tools: string[]; allowed_project_ids: string[]; permissions: { read: boolean; analyze: boolean; prepare: boolean; execute_with_approval: boolean }; enabled: boolean };

const emptyForm = (): FormState => ({
  name: "", role_title: "", specialty: "", instructions: "", skills: "", tools: ["project_context", "memory_read"],
  allowed_project_ids: [], permissions: { read: true, analyze: true, prepare: true, execute_with_approval: false }, enabled: true,
});

function AgentsView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const save = useServerFn(saveRecord);
  const del = useServerFn(deleteRecord);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  function openEdit(a: AgentItem) {
    const p = (a.permissions ?? {}) as Record<string, boolean>;
    setForm({
      id: a.id, name: a.name, role_title: a.role_title, specialty: a.specialty, instructions: a.instructions,
      skills: Array.isArray(a.skills) ? (a.skills as string[]).join(", ") : "",
      tools: Array.isArray(a.tools) ? (a.tools as string[]) : [],
      allowed_project_ids: a.allowed_project_ids ?? [],
      permissions: { read: p["read"] ?? true, analyze: p["analyze"] ?? true, prepare: p["prepare"] ?? true, execute_with_approval: p["execute_with_approval"] ?? false },
      enabled: a.enabled,
    });
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const values = {
        name: form.name, role_title: form.role_title, specialty: form.specialty, instructions: form.instructions,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        tools: form.tools, allowed_project_ids: form.allowed_project_ids, permissions: form.permissions, enabled: form.enabled,
      };
      await save({ data: { kind: "agent", ...(form.id ? { id: form.id } : {}), values } });
      toast.success(form.id ? "Agent mis à jour." : "Agent créé.");
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'enregistrement");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(a: AgentItem, enabled: boolean) {
    try {
      const p = (a.permissions ?? {}) as Record<string, boolean>;
      await save({
        data: {
          kind: "agent", id: a.id,
          values: {
            name: a.name, role_title: a.role_title, specialty: a.specialty, instructions: a.instructions,
            skills: Array.isArray(a.skills) ? a.skills : [], tools: Array.isArray(a.tools) ? a.tools : [],
            allowed_project_ids: a.allowed_project_ids ?? [],
            permissions: { read: p["read"] ?? true, analyze: p["analyze"] ?? true, prepare: p["prepare"] ?? true, execute_with_approval: p["execute_with_approval"] ?? false },
            enabled,
          },
        },
      });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action refusée");
    }
  }

  async function handleDelete(id: string) {
    try {
      await del({ data: { kind: "agent", id } });
      toast.success("Agent supprimé.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppression refusée");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Équipe d'agents IA" sub="Vigilia Lead orchestre automatiquement les spécialistes actifs selon la nature de chaque mission.">
        <Button size="sm" onClick={() => { setForm(emptyForm()); setOpen(true); }}><Plus className="mr-1.5 size-4" />Nouvel agent</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        {w.agents.map((a) => (
          <Card key={a.id} className={!a.enabled ? "opacity-60" : undefined}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <StatusDot status={a.enabled ? "active" : "disabled"} />
                    <span className="truncate">{a.name}</span>
                    {a.is_lead && <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary"><Crown className="size-3" />Lead</span>}
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.role_title} · {a.specialty}</p>
                </div>
                <Switch checked={a.enabled} disabled={a.is_lead} onCheckedChange={(v) => toggleEnabled(a, v)} aria-label={`Activer ${a.name}`} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="line-clamp-3 text-xs text-muted-foreground">{a.instructions}</p>
              <div className="flex flex-wrap gap-1">
                {(Array.isArray(a.skills) ? (a.skills as string[]) : []).map((sk) => (
                  <span key={sk} className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px]">{sk}</span>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <span className="font-mono text-[11px] text-muted-foreground">{(Array.isArray(a.tools) ? a.tools.length : 0)} outil(s)</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="size-3.5" /></Button>
                  {!a.is_builtin && <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)} className="text-destructive"><Trash2 className="size-3.5" /></Button>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Modifier l'agent" : "Créer un agent spécialiste"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Nom</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Rôle</Label><Input required value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} /></div>
            </div>
            <div><Label>Spécialité</Label><Input required value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
            <div><Label>Instructions système</Label><Textarea required rows={4} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
            <div><Label>Compétences (séparées par virgules)</Label><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="postgres, docker, redis" /></div>
            <div className="space-y-1.5">
              <Label>Outils autorisés</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((t) => {
                  const on = form.tools.includes(t);
                  return (
                    <button key={t} type="button" onClick={() => setForm({ ...form, tools: on ? form.tools.filter((x) => x !== t) : [...form.tools, t] })}
                      className={`rounded border px-2 py-1 font-mono text-xs ${on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}