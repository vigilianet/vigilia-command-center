import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Rocket, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { Md } from "@/components/app/md";
import { PageHeader } from "@/components/app/status";
import { pageHead } from "@/lib/workspace/head";
import { askAssistant } from "@/lib/workspace/integrations.functions";
import { createMission, runMission, type Workspace } from "@/lib/workspace/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ChatMsg = { role: "user" | "assistant"; content: string; meta?: string };

export const Route = createFileRoute("/assistant")({
  head: () => pageHead("Assistant IA", "Échangez avec Vigilia Lead à partir du contexte réel de vos projets et incidents."),
  component: () => <AppShell>{(w, refresh) => <AssistantView w={w} refresh={refresh} />}</AppShell>,
});

const SUGGESTIONS = [
  "Fais le point sur mes projets, contrôles et incidents ouverts.",
  "Quels sont les points de vigilance sécurité ou surveillance prioritaires ?",
  "Propose un plan d'action structuré pour fiabiliser mon infrastructure.",
];

function AssistantView({ w, refresh }: { w: Workspace; refresh: () => void }) {
  const navigate = useNavigate();
  const ask = useServerFn(askAssistant);
  const addMission = useServerFn(createMission);
  const execMission = useServerFn(runMission);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalating, setEscalating] = useState(false);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await ask({ data: { messages: next.map(({ role, content }) => ({ role, content })) } });
      setMessages([...next, { role: "assistant", content: r.text, meta: `${r.provider} · ${r.model}` }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de l'assistant IA");
    } finally {
      setBusy(false);
    }
  }

  async function promoteToMission(promptText: string) {
    if (escalating) return;
    setEscalating(true);
    try {
      const created = await addMission({
        data: { title: promptText.slice(0, 120), description: promptText, project_id: null, priority: "medium", token_budget: 32000, max_steps: 6 },
      });
      toast.success("Mission créée, lancement de l'équipe d'agents…");
      execMission({ data: { id: created.id } }).catch(() => {});
      refresh();
      void navigate({ to: "/missions" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de créer la mission");
    } finally {
      setEscalating(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader title="Assistant Vigilia Lead" sub={`Contexte connecté : ${w.projects.length} projet(s), ${w.monitors.length} contrôle(s), ${w.incidents.filter((i) => i.status !== "resolved").length} incident(s) ouverts.`}>
        {messages.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setMessages([])}>
            <Trash2 className="mr-1.5 size-4" />Effacer
          </Button>
        )}
      </PageHeader>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Bot className="size-6" />
                </div>
                <div className="max-w-md space-y-1">
                  <p className="font-medium">Directeur technique IA connecté à vos données réelles</p>
                  <p className="text-xs text-muted-foreground">Les secrets sont automatiquement bloqués. Pour une investigation multi-agents, transformez une demande en mission.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => send(s)} className="h-auto whitespace-normal py-2 text-left text-xs">
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div key={idx} className={m.role === "user" ? "ml-auto max-w-2xl rounded-lg bg-primary/15 px-4 py-3 text-sm" : "mr-auto max-w-3xl rounded-lg border border-border bg-secondary/40 px-4 py-3"}>
                  {m.role === "user" ? (
                    <div className="space-y-2">
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <Button size="sm" variant="ghost" disabled={escalating} onClick={() => promoteToMission(m.content)} className="h-7 px-2 text-xs text-primary">
                        <Rocket className="mr-1 size-3.5" />Lancer en mission multi-agents
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Md text={m.content} />
                      {m.meta && <div className="font-mono text-[11px] text-muted-foreground">{m.meta}</div>}
                    </div>
                  )}
                </div>
              ))
            )}
            {busy && <div className="text-xs text-muted-foreground animate-pulse">Vigilia Lead analyse votre contexte…</div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2 border-t border-border pt-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder="Posez une question technique ou demandez un diagnostic…"
              className="min-h-[48px] max-h-36 resize-none"
            />
            <Button type="submit" disabled={busy || !input.trim()} className="self-end">
              <Send className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}