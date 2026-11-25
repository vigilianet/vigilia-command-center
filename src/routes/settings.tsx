import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/shell";
import { PageHeader, fmtDate } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { deleteRecord } from "@/lib/workspace/integrations.functions";
import { saveRecord, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/settings")({
  head: () => pageHead("Paramètres & Mémoire", "Gérez la mémoire technique persistante de vos agents et la sécurité de votre accès."),
  component: () => <AppShell>{(w, refresh) => <SettingsView w={w} refresh={refresh} />}</AppShell>,
});

type MemForm = { id?: string; title: string; content: string; scope: "global" | "project" | "agent"; category: "decision" | "investigation" | "preference" | "documentation" | "knowledge"; project_id: string; agent_id: string; obsolete: boolean };
const emptyMem = (): MemForm => ({ title: "", content: "", scope: "global", category: "knowledge", project_id: "none", agent_id: "none", obsolete: false });

function SettingsView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const save = useServerFn(saveRecord);
  const del = useServerFn(deleteRecord);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MemForm>(emptyMem());
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const memories = scopeFilter === "all" ? w.memories : w.memories.filter((m) => m.scope === scopeFilter);

  function openEdit(m: Workspace["memories"][number]) {
    setForm({
      id: m.id, title: m.title, content: m.content, scope: m.scope as MemForm["scope"], category: m.category as MemForm["category"],
      project_id: m.project_id ?? "none", agent_id: m.agent_id ?? "none", obsolete: m.obsolete,
    });
    setOpen(true);
  }

  async function handleSaveMem(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({
        data: {
          kind: "memory", ...(form.id ? { id: form.id } : {}),
          values: {
            title: form.title, content: form.content, scope: form.scope, category: form.category,
            project_id: form.scope === "project" && form.project_id !== "none" ? form.project_id : null,
            agent_id: form.scope === "agent" && form.agent_id !== "none" ? form.agent_id : null,
            obsolete: form.obsolete,
          },
        },
      });
      toast.success(form.id ? "Mémoire mise à jour." : "Mémoire enregistrée.");
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'enregistrement");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) return toast.error("8 caractères minimum pour le nouveau mot de passe.");
    setPwdBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd, current_password: curPwd } as never);
      if (error) throw error;
      setCurPwd(""); setNewPwd("");
      toast.success("Mot de passe mis à jour.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de modifier le mot de passe");
    } finally { setPwdBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres & Mémoire" sub="Base de connaissances réutilisée par Vigilia Lead et règles de sécurité de l'espace." />

      <Tabs defaultValue="memory">
        <TabsList>
          <TabsTrigger value="memory">Mémoire IA ({w.memories.length})</TabsTrigger>
          <TabsTrigger value="security">Paramètres & Sécurité</TabsTrigger>
        </TabsList>

        <TabsContent value="memory" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {["all", "global", "project", "agent"].map((s) => (
                <Button key={s} size="sm" variant={scopeFilter === s ? "default" : "outline"} onClick={() => setScopeFilter(s)}>
                  {s === "all" ? "Toutes" : s}
                </Button>
              ))}
            </div>
            <Button size="sm" onClick={() => { setForm(emptyMem()); setOpen(true); }}><Plus className="mr-1.5 size-4" />Ajouter une mémoire</Button>
          </div>
          {memories.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucune entrée de mémoire enregistrée.</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {memories.map((m) => (
                <Card key={m.id} className={m.obsolete ? "opacity-60" : undefined}>
                  <CardContent className="space-y-2 p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium"><Brain className="size-3.5 text-primary" /><span className="truncate">{m.title}</span></div>
                        <div className="mt-0.5 flex gap-1.5 font-mono text-[11px] text-muted-foreground">
                          <span>{m.scope}</span>·<span>{m.category}</span>·<span>{fmtDate(m.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Pencil className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={async () => { await del({ data: { kind: "memory", id: m.id } }); toast.success("Supprimée."); refresh(); }} className="text-destructive"><Trash2 className="size-3.5" /></Button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">{m.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="security" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />Gouvernance Vigilia</CardTitle>
              <CardDescription>Protections actives sur cet espace personnel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Propriétaire autorisé :</strong> <span className="font-mono">{w.email}</span></p>
              <p><strong className="text-foreground">Contrôle d'accès :</strong> Politiques RLS restrictives (rôle <code className="font-mono">owner</code> vérifié côté serveur).</p>
              <p><strong className="text-foreground">Protection SSRF :</strong> Adresses IP privées, locales et ports non standards bloqués avant chaque requête HTTP.</p>
              <p><strong className="text-foreground">Protection secrets :</strong> Détection automatique dans les demandes et chiffrement AES-256-GCM en base.</p>
              <p><strong className="text-foreground">Branches GitHub :</strong> Écriture directe sur <code className="font-mono">main</code>, <code className="font-mono">master</code>, <code className="font-mono">prod</code> et <code className="font-mono">production</code> interdite.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Lock className="size-4 text-primary" />Changer le mot de passe</CardTitle>
              <CardDescription>Applicable si vous utilisez la connexion par e-mail et mot de passe.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div><Label htmlFor="cpw">Mot de passe actuel</Label><Input id="cpw" type="password" required value={curPwd} onChange={(e) => setCurPwd(e.target.value)} /></div>
                <div><Label htmlFor="npw">Nouveau mot de passe</Label><Input id="npw" type="password" required value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="8 caractères minimum" /></div>
                <Button type="submit" size="sm" disabled={pwdBusy}>{pwdBusy ? "Mise à jour…" : "Mettre à jour"}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Modifier la mémoire" : "Nouvelle mémoire persistante"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveMem} className="space-y-3">
            <div><Label>Titre</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Portée</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as MemForm["scope"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="global">Globale</SelectItem><SelectItem value="project">Projet</SelectItem><SelectItem value="agent">Agent</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as MemForm["category"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="knowledge">Connaissance</SelectItem><SelectItem value="decision">Décision</SelectItem>
                    <SelectItem value="investigation">Investigation</SelectItem><SelectItem value="preference">Préférence</SelectItem>
                    <SelectItem value="documentation">Documentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.scope === "project" && (
              <div>
                <Label>Projet</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Choisir…</SelectItem>{w.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.scope === "agent" && (
              <div>
                <Label>Agent</Label>
                <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Choisir…</SelectItem>{w.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Contenu</Label><Textarea required rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div className="flex items-center justify-between"><Label>Marquer comme obsolète</Label><Switch checked={form.obsolete} onCheckedChange={(v) => setForm({ ...form, obsolete: v })} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}