import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, GitBranch, Pencil, Plus, Search, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { PageHeader, StatusDot, fmtDate } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { deleteRecord, inspectRepo } from "@/lib/workspace/integrations.functions";
import { saveRecord, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/projects")({
  head: () => pageHead("Projets", "Inventaire de vos projets, dépôts GitHub, technologies et inspections techniques."),
  component: () => <AppShell>{(w, refresh) => <ProjectsView w={w} refresh={refresh} />}</AppShell>,
});

type RepoInfo = Awaited<ReturnType<typeof inspectRepo>>;
type ProjectForm = { id?: string; name: string; category: string; url: string; github_repo: string; description: string; technologies: string; environments: string; services: string; notes: string };
const emptyForm = (): ProjectForm => ({ name: "", category: "", url: "", github_repo: "", description: "", technologies: "", environments: "production", services: "", notes: "" });

function ProjectsView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const save = useServerFn(saveRecord);
  const del = useServerFn(deleteRecord);
  const inspect = useServerFn(inspectRepo);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm());
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [repoData, setRepoData] = useState<RepoInfo | null>(null);

  function openEdit(p: Workspace["projects"][number]) {
    const csv = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(", ") : "");
    setForm({
      id: p.id, name: p.name, category: p.category ?? "", url: p.url ?? "", github_repo: p.github_repo ?? "",
      description: p.description ?? "", technologies: csv(p.technologies), environments: csv(p.environments), services: csv(p.services), notes: p.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
      await save({
        data: {
          kind: "project", ...(form.id ? { id: form.id } : {}),
          values: {
            name: form.name, category: form.category, url: form.url, github_repo: form.github_repo, description: form.description,
            technologies: split(form.technologies), environments: split(form.environments), services: split(form.services), notes: form.notes,
          },
        },
      });
      toast.success(form.id ? "Projet mis à jour." : "Projet ajouté.");
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'enregistrement");
    } finally {
      setBusy(false);
    }
  }

  async function handleInspect(id: string, repo: string) {
    setInspectingId(id);
    try {
      const data = await inspect({ data: { repo } });
      setRepoData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inspection GitHub impossible");
    } finally {
      setInspectingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await del({ data: { kind: "project", id } });
      toast.success("Projet supprimé.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de suppression");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Projets" sub="Centralisez vos applications, dépôts GitHub et services supervisés par Vigilia.">
        <Button size="sm" onClick={() => { setForm(emptyForm()); setOpen(true); }}><Plus className="mr-1.5 size-4" />Nouveau projet</Button>
      </PageHeader>

      {w.projects.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucun projet enregistré. Ajoutez votre premier projet ou dépôt GitHub.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {w.projects.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <StatusDot status={p.status} />
                      <span className="truncate">{p.name}</span>
                    </CardTitle>
                    {p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="text-destructive"><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                <div className="flex flex-wrap gap-2 text-xs">
                  {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3" />{p.url}</a>}
                  {p.github_repo && <span className="inline-flex items-center gap-1 font-mono text-muted-foreground"><GitBranch className="size-3" />{p.github_repo}</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(p.technologies) ? (p.technologies as string[]) : []).map((t) => (
                    <span key={t} className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px]">{t}</span>
                  ))}
                </div>
                {p.github_repo && (
                  <div className="border-t border-border pt-2.5">
                    <Button size="sm" variant="outline" disabled={inspectingId === p.id} onClick={() => handleInspect(p.id, p.github_repo!)}>
                      <Search className="mr-1.5 size-3.5" />{inspectingId === p.id ? "Inspection…" : "Inspecter le dépôt GitHub"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Modifier le projet" : "Nouveau projet"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Nom</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Catégorie</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="SaaS, API, Infra" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>URL publique</Label><Input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div>
              <div><Label>Dépôt GitHub</Label><Input value={form.github_repo} onChange={(e) => setForm({ ...form, github_repo: e.target.value })} placeholder="owner/repo" /></div>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Technologies (virgules)</Label><Input value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} placeholder="React, Postgres, Docker" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Environnements</Label><Input value={form.environments} onChange={(e) => setForm({ ...form, environments: e.target.value })} /></div>
              <div><Label>Services</Label><Input value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} /></div>
            </div>
            <div><Label>Notes techniques</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(repoData)} onOpenChange={(v) => !v && setRepoData(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Inspection GitHub : {repoData?.name}</DialogTitle></DialogHeader>
          {repoData && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-secondary px-2 py-1 font-mono">Branche : {repoData.default_branch}</span>
                <span className="rounded bg-secondary px-2 py-1 font-mono">{repoData.file_count} fichiers</span>
                <span className="rounded bg-secondary px-2 py-1">{repoData.private ? "Privé" : "Public"}</span>
                <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1">{repoData.has_tests ? <CheckCircle2 className="size-3 text-success" /> : <AlertTriangle className="size-3 text-warning" />}Tests</span>
                <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1">{repoData.has_ci ? <CheckCircle2 className="size-3 text-success" /> : <AlertTriangle className="size-3 text-warning" />}CI/CD</span>
              </div>
              {repoData.has_env_committed.length > 0 && (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                  Attention : fichier(s) .env détecté(s) dans le dépôt : {repoData.has_env_committed.join(", ")}
                </div>
              )}
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Derniers commits</h4>
                <div className="space-y-1">
                  {repoData.recent_commits.slice(0, 6).map((c) => (
                    <div key={c.sha} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate"><code className="mr-1.5 font-mono text-primary">{c.sha}</code>{c.message}</span>
                      <span className="shrink-0 text-muted-foreground">{fmtDate(c.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}