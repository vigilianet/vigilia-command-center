import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Bot, Users, FolderKanban, ShieldCheck, Activity,
  Plug, Cpu, ScrollText, Settings, LogOut, Menu, Shield, AlertTriangle, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOwner } from "@/hooks/use-owner";
import { workspaceQuery } from "@/lib/workspace/query";
import type { Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/assistant", label: "Assistant", icon: Bot },
  { to: "/agents", label: "Agents", icon: Users },
  { to: "/projects", label: "Projets", icon: FolderKanban },
  { to: "/missions", label: "Missions & Approb.", icon: ShieldCheck },
  { to: "/monitoring", label: "Surveillance", icon: Activity },
  { to: "/integrations", label: "Intégrations", icon: Plug },
  { to: "/providers", label: "Fournisseurs IA", icon: Cpu },
  { to: "/logs", label: "Journaux", icon: ScrollText },
  { to: "/settings", label: "Paramètres & Mémoire", icon: Settings },
] as const;

export function AppShell({ children }: { children: (w: Workspace, refetch: () => void) => ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const owner = useOwner();
  const ws = useQuery({ ...workspaceQuery(), enabled: owner.isSuccess });

  useEffect(() => {
    if (owner.isError) void navigate({ to: "/login" });
  }, [owner.isError, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    qc.clear();
    void navigate({ to: "/login" });
  }

  if (owner.isPending || owner.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Shield className="size-5 animate-pulse text-primary" />
          <span>Vérification de la session Vigilia…</span>
        </div>
      </div>
    );
  }

  if (ws.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-signal px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-4">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Accès non autorisé</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{ws.error instanceof Error ? ws.error.message : "Cet espace est strictement personnel."}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">Connecté en tant que : {owner.data.email}</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => ws.refetch()}>Réessayer</Button>
            <Button variant="destructive" size="sm" onClick={signOut}>Se déconnecter</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ws.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin text-primary" />
          <span>Chargement du centre de commandement…</span>
        </div>
      </div>
    );
  }

  const w = ws.data;
  const openInc = w.incidents.filter((i) => i.status !== "resolved").length;
  const pendAppr = w.approvals.filter((a) => a.status === "pending").length;

  const navBody = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Shield className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">Vigilia</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Command Center</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const badge = item.to === "/monitoring" ? openInc : item.to === "/missions" ? pendAppr : 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-sidebar-accent font-medium text-primary" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <span className="flex items-center gap-2.5 truncate">
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {badge > 0 && (
                <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 font-mono text-[10px] font-medium text-destructive">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <div className="truncate px-1 font-mono text-[11px] text-muted-foreground">{w.email}</div>
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
          <LogOut className="size-4" />
          <span>Déconnexion</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border lg:block">{navBody}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ouvrir le menu"><Menu className="size-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation Vigilia</SheetTitle>
                {navBody}
              </SheetContent>
            </Sheet>
            <span className="font-semibold tracking-tight">Vigilia</span>
          </div>
          <div className="flex items-center gap-2">
            {openInc > 0 && <span className="rounded-full bg-destructive/20 px-2 py-0.5 font-mono text-xs text-destructive">{openInc} inc.</span>}
            {pendAppr > 0 && <span className="rounded-full bg-warning/20 px-2 py-0.5 font-mono text-xs text-warning">{pendAppr} appr.</span>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {children(w, () => void qc.invalidateQueries({ queryKey: ["workspace"] }))}
        </main>
      </div>
    </div>
  );
}