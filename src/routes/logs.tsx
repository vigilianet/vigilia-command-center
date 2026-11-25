import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { PageHeader, StatusDot, fmtDate } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import type { Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/logs")({
  head: () => pageHead("Journaux", "Journal d'audit complet, historique des contrôles HTTP et bascules IA."),
  component: () => <AppShell>{(w) => <LogsView w={w} />}</AppShell>,
});

function LogsView({ w }: { w: Workspace }) {
  const [actorFilter, setActorFilter] = useState<string>("all");
  const monById = new Map(w.monitors.map((m) => [m.id, m.name]));
  const filteredAudit = actorFilter === "all" ? w.logs : w.logs.filter((l) => l.actor_type === actorFilter);

  return (
    <div className="space-y-6">
      <PageHeader title="Journaux & Traçabilité" sub="Audit des décisions, exécutions d'agents, vérifications HTTP et événements Telegram." />

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Audit ({w.logs.length})</TabsTrigger>
          <TabsTrigger value="checks">Contrôles HTTP ({w.checks.length})</TabsTrigger>
          <TabsTrigger value="telegram">Telegram ({w.telegramMessages.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {["all", "user", "agent", "telegram", "system"].map((f) => (
              <Button key={f} size="sm" variant={actorFilter === f ? "default" : "outline"} onClick={() => setActorFilter(f)}>
                {f === "all" ? "Tous" : f}
              </Button>
            ))}
          </div>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {filteredAudit.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Aucune entrée d'audit pour ce filtre.</p>
              ) : (
                filteredAudit.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{l.actor_type}</span>
                      <span className="font-medium">{l.action}</span>
                      <span className="truncate text-muted-foreground">par {l.actor_name}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">{fmtDate(l.created_at)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checks" className="mt-4">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {w.checks.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Aucun contrôle exécuté pour le moment.</p>
              ) : (
                w.checks.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusDot status={c.ok ? "up" : "down"} />
                      <span className="font-medium">{monById.get(c.monitor_id) ?? c.monitor_id.slice(0, 8)}</span>
                      <span className="font-mono text-muted-foreground">HTTP {c.status_code ?? "—"} · {c.response_ms != null ? `${c.response_ms} ms` : "—"}</span>
                      {c.error && <span className="truncate text-destructive">{c.error}</span>}
                    </div>
                    <span className="font-mono text-muted-foreground">{fmtDate(c.checked_at)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="telegram" className="mt-4">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {w.telegramMessages.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Aucun message Telegram reçu.</p>
              ) : (
                w.telegramMessages.map((m) => (
                  <div key={m.update_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">{m.direction}</span>
                      <span className="truncate">{m.text}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">{fmtDate(m.created_at)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}