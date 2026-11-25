import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, GitBranch, Play, Plus, ShieldCheck, X, Ban } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { Md } from "@/components/app/md";
import { MissionStatusBadge, PageHeader, SeverityBadge, fmtDate } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { executeApproval } from "@/lib/workspace/integrations.functions";
import { cancelMission, createMission, decideApproval, runMission, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/missions")({
  head: () => pageHead("Missions & Approbations", "Orchestrez des missions multi-agents persistantes et validez chaque action sensible."),
  component: () => <AppShell>{(w, refresh) => <MissionsView w={w} refresh={refresh} />}</AppShell>,
});

function MissionsView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const addMission = useServerFn(createMission);
  const execMission = useServerFn(runMission);
  const stopMission = useServerFn(cancelMission);
  const decide = useServerFn(decideApproval);
  const execAppr = useServerFn(executeApproval);

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(w.missions[0]?.id ?? null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [branchInput, setBranchInput] = useState<Record<string, { base: string; next: string }>>({});

  const selected = w.missions.find((m) => m.id === selectedId) ?? w.missions[0] ?? null;
  const selectedSteps = selected ? w.steps.filter((s) => s.mission_id === selected.id) : [];
  const pendingCount = w.approvals.filter((a) => a.status === "pending").length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await addMission({
        data: { title, description: desc, project_id: projectId === "none" ? null : projectId, priority, token_budget: 32000, max_steps: 6 },
      });
      setTitle(""); setDesc(""); setProjectId("none"); setOpen(false);
      setSelectedId(created.id);
      refresh();
      toast.success("Mission créée — lancement en cours…");
      setRunningId(created.id);
      await execMission({ data: { id: created.id } });
      refresh();
      toast.success("Mission terminée.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur mission");
      refresh();
    } finally {
      setRunningId(null);
    }
  }

  async function handleRun(id: string) {
    setRunningId(id);
    try {
      await execMission({ data: { id } });
      toast.success("Mission exécutée.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec d'exécution");
      refresh();
    } finally {
      setRunningId(null);
    }
  }

  async function handleCancel(id: string) {
    try {
      await stopMission({ data: { id } });
      toast.success("Mission annulée.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Annulation impossible");
    }
  }

  async function handleDecide(id: string, approve: boolean) {
    try {
      await decide({ data: { id, approve, note: notes[id] ?? "" } });
      toast.success(approve ? "Action approuvée." : "Action refusée.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Décision impossible");
    }
  }

  async function handleExecBranch(id: string) {
    const cfg = branchInput[id] ?? { base: "main", next: "" };
    if (!cfg.next.trim()) return toast.error("Indiquez le nom de la nouvelle branche.");
    try {
      const r = await execAppr({ data: { id, baseBranch: cfg.base || "main", newBranch: cfg.next.trim() } });
      toast.success(`Branche créée : ${r.branch}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Exécution GitHub refusée");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Missions & Approbations" sub="Chaque opération sensible (écriture GitHub, prod, migration) exige votre validation explicite.">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 size-4" />Nouvelle mission</Button>
      </PageHeader>

      <Tabs defaultValue={pendingCount > 0 ? "approvals" : "missions"}>
        <TabsList>
          <TabsTrigger value="missions">Missions ({w.missions.length})</TabsTrigger>
          <TabsTrigger value="approvals">Approbations ({pendingCount} en attente)</TabsTrigger>
        </TabsList>

        <TabsContent value="missions" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-5">
              {w.missions.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aucune mission pour le moment.</CardContent></Card>
              ) : (
                w.missions.map((m) => (
                  <button key={m.id} type="button" onClick={() => setSelectedId(m.id)}
                    className={`w-full rounded-lg border p-3.5 text-left transition-colors ${selected?.id === m.id ? "border-primary bg-card" : "border-border bg-card/50 hover:border-border/80"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium">{m.title}</span>
                      <MissionStatusBadge status={m.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{fmtDate(m.created_at)}</span>
                      <span className="font-mono">{m.progress}% · {m.tokens_used} tok.</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="lg:col-span-7">
              {selected ? (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{selected.title}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {(selected.status === "pending" || selected.status === "failed") && (
                          <Button size="sm" disabled={runningId === selected.id} onClick={() => handleRun(selected.id)}>
                            <Play className="mr-1 size-3.5" />{runningId === selected.id ? "Exécution…" : "Exécuter"}
                          </Button>
                        )}
                        {["pending", "planning", "investigating", "in_progress", "validating"].includes(selected.status) && (
                          <Button size="sm" variant="outline" onClick={() => handleCancel(selected.id)}><Ban className="mr-1 size-3.5" />Annuler</Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedSteps.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Étapes d'exécution</h4>
                        {selectedSteps.map((st) => (
                          <div key={st.id} className="rounded-md border border-border bg-secondary/30 p-3 text-xs">
                            <div className="flex items-center justify-between font-medium">
                              <span>{st.step_order}. {st.agent_name} — {st.title}</span>
                              <span className="font-mono text-muted-foreground">{st.status}</span>
                            </div>
                            {st.output_summary && <p className="mt-1.5 line-clamp-4 text-muted-foreground">{st.output_summary}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {selected.final_report && (
                      <div className="rounded-lg border border-border bg-background/60 p-4">
                        <Md text={selected.final_report} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Sélectionnez une mission pour consulter son rapport.</CardContent></Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4 space-y-3">
          {w.approvals.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucune demande d'approbation enregistrée.</CardContent></Card>
          ) : (
            w.approvals.map((ap) => {
              const br = branchInput[ap.id] ?? { base: "main", next: `vigilia/fix-${ap.id.slice(0, 6)}` };
              return (
                <Card key={ap.id}>
                  <CardContent className="space-y-3 p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-4 text-primary" />
                          <span className="font-semibold">{ap.title}</span>
                          <SeverityBadge s={ap.risk_level} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{ap.operation} · Expire : {fmtDate(ap.expires_at)}</p>
                      </div>
                      <span className="rounded border border-border px-2 py-0.5 font-mono text-xs">{ap.status}</span>
                    </div>
                    <div className="grid gap-2 rounded bg-secondary/30 p-3 text-xs sm:grid-cols-2">
                      <div><strong>Risque :</strong> {ap.risk_summary}</div>
                      <div><strong>Résultat attendu :</strong> {ap.expected_result}</div>
                      {ap.target_repo && <div className="font-mono"><strong>Dépôt :</strong> {ap.target_repo}</div>}
                    </div>
                    {ap.status === "pending" && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Input value={notes[ap.id] ?? ""} onChange={(e) => setNotes({ ...notes, [ap.id]: e.target.value })} placeholder="Note de décision (optionnelle)" className="max-w-xs text-xs" />
                        <Button size="sm" onClick={() => handleDecide(ap.id, true)}><Check className="mr-1 size-3.5" />Approuver</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDecide(ap.id, false)}><X className="mr-1 size-3.5" />Refuser</Button>
                      </div>
                    )}
                    {ap.status === "approved" && ap.action_type === "github_write" && ap.target_repo && (
                      <div className="flex flex-wrap items-end gap-2 rounded border border-primary/30 bg-primary/5 p-3">
                        <div><Label className="text-xs">Branche base</Label><Input value={br.base} onChange={(e) => setBranchInput({ ...branchInput, [ap.id]: { ...br, base: e.target.value } })} className="h-8 w-32 font-mono text-xs" /></div>
                        <div><Label className="text-xs">Nouvelle branche</Label><Input value={br.next} onChange={(e) => setBranchInput({ ...branchInput, [ap.id]: { ...br, next: e.target.value } })} className="h-8 w-52 font-mono text-xs" /></div>
                        <Button size="sm" onClick={() => handleExecBranch(ap.id)}><GitBranch className="mr-1 size-3.5" />Créer la branche</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Lancer une nouvelle mission IA</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3.5">
            <div><Label>Titre</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Auditer les performances API" /></div>
            <div><Label>Objectif détaillé</Label><Textarea required rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Décrivez le symptôme ou l'analyse souhaitée…" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Projet associé</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Détection automatique</SelectItem>
                    {w.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priorité</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Faible</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Élevée</SelectItem>
                    <SelectItem value="critical">Critique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit">Créer et exécuter</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}