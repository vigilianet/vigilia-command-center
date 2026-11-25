import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Activity, AlertTriangle, Bot, Cpu, FolderKanban, Play, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { IncidentStatus, MissionStatusBadge, PageHeader, SeverityBadge, StatusDot, fmtDate, fmtDuration } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { checkMonitor, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => pageHead("Tableau de bord", "Vue d'ensemble en temps réel de vos projets, contrôles de surveillance, incidents, missions IA et approbations."),
  component: () => <AppShell>{(w, refresh) => <DashboardView w={w} refresh={refresh} />}</AppShell>,
});

function DashboardView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const runCheck = useServerFn(checkMonitor);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const openInc = w.incidents.filter((i) => i.status !== "resolved");
  const downMons = w.monitors.filter((m) => m.last_status === "down");
  const pendAppr = w.approvals.filter((a) => a.status === "pending");
  const activeProviders = w.providers.filter((p) => p.enabled && p.status === "active");
  const activeAgents = w.agents.filter((a) => a.enabled);

  async function handleQuickCheck(id: string) {
    setCheckingId(id);
    try {
      const r = await runCheck({ data: { id } });
      toast[r.ok ? "success" : "error"](r.ok ? `Contrôle OK (${r.response_ms ?? 0} ms)` : r.error ?? "Échec du contrôle");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du contrôle");
    } finally {
      setCheckingId(null);
    }
  }

  const stats = [
    { label: "Projets", value: w.projects.length, sub: `${activeAgents.length} agents actifs`, icon: FolderKanban, to: "/projects" as const },
    { label: "Surveillance", value: `${w.monitors.length - downMons.length}/${w.monitors.length}`, sub: downMons.length ? `${downMons.length} en panne` : "Tous opérationnels", icon: Activity, to: "/monitoring" as const, alert: downMons.length > 0 },
    { label: "Incidents ouverts", value: openInc.length, sub: openInc.length ? "Action requise" : "Aucun incident", icon: AlertTriangle, to: "/monitoring" as const, alert: openInc.length > 0 },
    { label: "Approbations", value: pendAppr.length, sub: pendAppr.length ? "En attente de décision" : "À jour", icon: ShieldCheck, to: "/missions" as const, alert: pendAppr.length > 0 },
    { label: "Fournisseurs IA", value: activeProviders.length, sub: `${w.providers.length} configuré(s)`, icon: Cpu, to: "/providers" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord" sub="Centre de commandement personnel — surveillance réelle, missions et gouvernance IA.">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link to="/assistant"><Bot className="mr-1.5 size-4" />Assistant IA</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/missions">Nouvelle mission</Link></Button>
        </div>
      </PageHeader>

      {pendAppr.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-4 shrink-0 text-warning" />
            <span><strong>{pendAppr.length} approbation(s)</strong> en attente avant exécution sensible.</span>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/missions">Examiner</Link></Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="group block">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{s.label}</span>
                  <s.icon className={s.alert ? "size-4 text-destructive" : "size-4 text-primary"} />
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold">{s.value}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.sub}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Contrôles & Incidents ouverts</CardTitle>
            <Link to="/monitoring" className="text-xs text-primary hover:underline">Tout voir</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {openInc.slice(0, 3).map((inc) => (
              <div key={inc.id} className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SeverityBadge s={inc.severity} />
                    <IncidentStatus s={inc.status} />
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">Ouvert depuis {fmtDuration(inc.started_at)}</p>
                </div>
              </div>
            ))}
            {w.monitors.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucun contrôle configuré. <Link to="/monitoring" className="text-primary hover:underline">Ajouter un contrôle HTTP</Link>.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {w.monitors.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StatusDot status={m.last_status} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.name}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {m.last_response_ms != null ? `${m.last_response_ms} ms` : "Non testé"} · {fmtDate(m.last_checked_at)}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" disabled={checkingId === m.id} onClick={() => handleQuickCheck(m.id)} aria-label={`Vérifier ${m.name}`}>
                      <Play className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Missions IA récentes</CardTitle>
            <Link to="/missions" className="text-xs text-primary hover:underline">Gérer</Link>
          </CardHeader>
          <CardContent>
            {w.missions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucune mission exécutée. <Link to="/missions" className="text-primary hover:underline">Lancer une mission</Link>.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {w.missions.slice(0, 6).map((ms) => (
                  <Link key={ms.id} to="/missions" className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{ms.title}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(ms.created_at)} · {ms.progress}%</div>
                    </div>
                    <MissionStatusBadge status={ms.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
