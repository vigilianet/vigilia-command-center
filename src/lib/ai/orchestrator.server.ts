import { runRoutedCompletion } from "./providers.server";
import { getOwnerGithubToken, inspectGithubRepo } from "@/lib/github/client.server";
import { notifyOwnerTelegram } from "@/lib/telegram/client.server";
import { redactSecrets } from "@/lib/crypto.server";

export type AgentRow = {
  id: string;
  slug: string;
  name: string;
  role_title: string;
  specialty: string;
  is_lead: boolean;
  enabled: boolean;
  instructions: string;
  skills: string[];
  tools: string[];
  allowed_project_ids: string[];
  permissions: { read?: boolean; analyze?: boolean; prepare?: boolean; execute_with_approval?: boolean };
};

export type StructuredDiagnosticReport = {
  observed_facts: string[];
  confirmed_cause: string;
  hypotheses: string[];
  missing_info: string[];
  affected_files: string[];
  solution: string[];
  risks: string[];
  requires_approval: boolean;
  proposed_action?: {
    action_type: "github_write" | "deploy" | "delete" | "migration" | "sensitive_config" | "permissions" | "irreversible";
    title: string;
    operation: string;
    target_repo?: string;
    target_files?: string[];
    risk_level: "low" | "medium" | "high" | "critical";
    risk_summary: string;
    expected_result: string;
  } | null;
};

export function selectSpecialistsForRequest(
  prompt: string,
  agents: AgentRow[],
  projectId?: string | null,
): AgentRow[] {
  const p = prompt.toLowerCase();
  const eligible = agents.filter(
    (a) =>
      a.enabled &&
      !a.is_lead &&
      (a.allowed_project_ids.length === 0 || !projectId || a.allowed_project_ids.includes(projectId)),
  );

  const matches: AgentRow[] = [];
  const scoreRules: { slug: string; re: RegExp }[] = [
    { slug: "software-engineer", re: /code|bug|auth|google|oauth|react|api|commit|pr|github|erreur|login|connexion|build|typescript/ },
    { slug: "sysadmin-ubuntu", re: /ubuntu|linux|serveur|ssh|docker|systemd|disque|ram|cpu|homelab|infra/ },
    { slug: "network-engineer", re: /réseau|network|dns|tls|ssl|https|timeout|latence|proxy|nginx|pare-feu|firewall|vpn/ },
    { slug: "cybersecurity-expert", re: /sécurité|security|secret|rls|permission|vulnérab|token|auth|oauth|fuite|audit/ },
    { slug: "monitoring-diagnostics", re: /surveill|monitor|incident|dispo|uptime|alerte|5xx|4xx|panne|down|diagnostic/ },
    { slug: "automation-engineer", re: /automat|telegram|webhook|cron|ci\/cd|pipeline|workflow|bot/ },
    { slug: "tech-project-manager", re: /plan|phase|priorit|roadmap|projet|synthèse|organis/ },
  ];

  for (const agent of eligible) {
    const rule = scoreRules.find((r) => r.slug === agent.slug);
    const customMatch =
      !rule &&
      (p.includes(agent.name.toLowerCase()) ||
        p.includes(agent.specialty.toLowerCase()) ||
        (agent.skills ?? []).some((s) => s.length >= 3 && p.includes(s.toLowerCase())));
    if ((rule && rule.re.test(p)) || customMatch) {
      matches.push(agent);
    }
  }

  return matches.slice(0, 3);
}

export function detectProjectFromPrompt<T extends { id: string; name: string; slug: string; github_repo?: string | null; url?: string | null }>(
  prompt: string,
  projects: T[],
): T | null {
  const lower = prompt.toLowerCase();
  for (const proj of projects) {
    if (
      lower.includes(proj.name.toLowerCase()) ||
      lower.includes(proj.slug.toLowerCase()) ||
      (proj.github_repo && lower.includes(proj.github_repo.toLowerCase()))
    ) {
      return proj;
    }
  }
  return null;
}

function parseJsonBlock<T>(raw: string): T | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!candidate || !candidate.includes("{")) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeMissionPipeline(admin: any, ownerId: string, missionId: string) {
  const { data: mission } = await admin.from("missions").select("*").eq("id", missionId).eq("owner_id", ownerId).single();
  if (!mission) throw new Error("Mission introuvable");
  if (mission.status === "cancelled") return mission;

  await admin
    .from("missions")
    .update({ status: "planning", progress: 10, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", missionId);

  try {
    // 1. Load agents, projects, integrations, memories
    const [{ data: agents }, { data: projects }, { data: integrations }, { data: memories }] = await Promise.all([
      admin.from("ai_agents").select("*").eq("owner_id", ownerId).eq("enabled", true),
      admin.from("projects").select("*").eq("owner_id", ownerId),
      admin.from("integrations").select("provider,name,status,permissions,last_tested_at,last_error").eq("owner_id", ownerId),
      admin.from("memories").select("scope,project_id,category,title,content").eq("owner_id", ownerId).eq("obsolete", false).limit(40),
    ]);

    const allAgents = (agents ?? []) as AgentRow[];
    const lead = allAgents.find((a) => a.is_lead) ?? allAgents[0];
    let projectId: string | null = mission.project_id;
    let project = (projects ?? []).find((p: { id: string }) => p.id === projectId) ?? null;
    if (!project) {
      project = detectProjectFromPrompt(mission.title + " " + mission.description, projects ?? []);
      if (project) {
        projectId = project.id;
        await admin.from("missions").update({ project_id: projectId }).eq("id", missionId);
      }
    }

    const specialists = selectSpecialistsForRequest(mission.title + " " + mission.description, allAgents, projectId);
    const assignedIds = [lead?.id, ...specialists.map((s) => s.id)].filter(Boolean) as string[];

    await admin
      .from("missions")
      .update({ status: "investigating", progress: 25, assigned_agent_ids: assignedIds, updated_at: new Date().toISOString() })
      .eq("id", missionId);

    // 2. Gather REAL project telemetry (monitors, checks, incidents, GitHub read-only)
    const contextFacts: Record<string, unknown> = {
      project: project
        ? {
            name: project.name,
            description: project.description,
            url: project.url,
            github_repo: project.github_repo,
            technologies: project.technologies,
            environments: project.environments,
            services: project.services,
            status: project.status,
          }
        : null,
      configured_integrations: integrations ?? [],
      memories: (memories ?? [])
        .filter((m: { scope: string; project_id: string | null }) => m.scope === "global" || m.project_id === projectId)
        .slice(0, 15),
    };

    if (projectId) {
      const [{ data: mons }, { data: incs }] = await Promise.all([
        admin.from("monitors").select("name,url,last_status,last_checked_at,last_response_ms,environment").eq("owner_id", ownerId).eq("project_id", projectId),
        admin.from("incidents").select("title,type,severity,status,description,started_at").eq("owner_id", ownerId).eq("project_id", projectId).order("started_at", { ascending: false }).limit(10),
      ]);
      contextFacts["monitors"] = mons ?? [];
      contextFacts["incidents"] = incs ?? [];
    } else {
      const [{ data: mons }, { data: incs }] = await Promise.all([
        admin.from("monitors").select("name,url,last_status,last_checked_at,last_response_ms").eq("owner_id", ownerId).limit(20),
        admin.from("incidents").select("title,type,severity,status,description,started_at").eq("owner_id", ownerId).neq("status", "resolved").limit(10),
      ]);
      contextFacts["monitors"] = mons ?? [];
      contextFacts["open_incidents"] = incs ?? [];
    }

    // Real GitHub read-only inspection if project has a repo
    if (project?.github_repo) {
      try {
        const ghToken = await getOwnerGithubToken(admin, ownerId);
        contextFacts["github_inspection"] = await inspectGithubRepo(project.github_repo, ghToken);
      } catch (e) {
        contextFacts["github_inspection_error"] = e instanceof Error ? e.message : "Lecture GitHub indisponible";
      }
    }

    // 3. Execute specialist steps (bounded by max_steps and token_budget)
    let totalTokens = mission.tokens_used ?? 0;
    const maxSteps = Math.min(mission.max_steps ?? 8, 6);
    const tokenBudget = mission.token_budget ?? 32000;
    const stepOutputs: { agent: string; specialty: string; findings: string }[] = [];

    const activeSpecialists = specialists.slice(0, Math.max(0, maxSteps - 1));
    for (let i = 0; i < activeSpecialists.length; i++) {
      if (totalTokens >= tokenBudget * 0.75) break;
      const sp = activeSpecialists[i]!;
      const { data: step } = await admin
        .from("mission_steps")
        .insert({
          mission_id: missionId,
          owner_id: ownerId,
          agent_id: sp.id,
          agent_name: sp.name,
          step_order: i + 1,
          title: `Analyse ${sp.specialty}`,
          status: "running",
        })
        .select("id")
        .single();

      const spSystem = `${sp.instructions}\nRÈGLES ABSOLUES : Ne suppose jamais une technologie ou un log non présent dans les données réelles ci-dessous. Sépare strictement faits observés, hypothèses et informations manquantes. Réponds en français concis.`;
      const spPrompt = `Mission : ${mission.title}\nDemande : ${mission.description}\nContexte réel disponible :\n${redactSecrets(JSON.stringify(contextFacts).slice(0, 9000))}`;

      const res = await runRoutedCompletion(admin, ownerId, spSystem, spPrompt, missionId);
      totalTokens += res.tokensUsed;
      stepOutputs.push({ agent: sp.name, specialty: sp.specialty, findings: res.text });

      if (step) {
        await admin
          .from("mission_steps")
          .update({ status: "completed", output_summary: res.text.slice(0, 4000), completed_at: new Date().toISOString() })
          .eq("id", step.id);
      }
      const pct = Math.min(70, 30 + Math.round(((i + 1) / Math.max(1, activeSpecialists.length)) * 40));
      await admin.from("missions").update({ status: "in_progress", progress: pct, tokens_used: totalTokens }).eq("id", missionId);
    }

    // 4. Lead COLLABORATOR consolidation & structured diagnostic report
    await admin.from("missions").update({ status: "validating", progress: 80 }).eq("id", missionId);
    const { data: leadStep } = await admin
      .from("mission_steps")
      .insert({
        mission_id: missionId,
        owner_id: ownerId,
        agent_id: lead?.id ?? null,
        agent_name: lead?.name ?? "Vigilia Lead",
        step_order: activeSpecialists.length + 1,
        title: "Consolidation & rapport de diagnostic",
        status: "running",
      })
      .select("id")
      .single();

    const leadSystem = `${lead?.instructions ?? "Tu es Vigilia Lead, directeur technique IA."}\nTu dois produire UNIQUEMENT un objet JSON valide (dans un bloc \`\`\`json ... \`\`\`) respectant strictement ce schéma :\n{\n  "observed_facts": ["fait réellement présent dans le contexte"],\n  "confirmed_cause": "cause prouvée ou 'Non confirmée — informations manquantes'",\n  "hypotheses": ["hypothèse clairement formulée comme hypothèse"],\n  "missing_info": ["accès, log ou élément manquant pour confirmer"],\n  "affected_files": ["fichier réel mentionné dans le contexte, sinon liste vide"],\n  "solution": ["étape concrète recommandée"],\n  "risks": ["risque identifié"],\n  "requires_approval": false,\n  "proposed_action": null\n}\nSi une écriture GitHub (jamais sur main/master), une modification de config sensible, une suppression, une migration ou un déploiement est nécessaire, mets "requires_approval": true et remplis "proposed_action": {"action_type":"github_write|deploy|delete|migration|sensitive_config|permissions|irreversible","title":"...","operation":"...","target_repo":"...","target_files":[],"risk_level":"low|medium|high|critical","risk_summary":"...","expected_result":"..."}.\nNe présente JAMAIS une hypothèse comme cause confirmée. Ne prétends JAMAIS avoir consulté des logs ou exécuté des tests non présents dans le contexte.`;

    const leadPrompt = `Mission : ${mission.title}\nDemande : ${mission.description}\nContexte réel :\n${redactSecrets(JSON.stringify(contextFacts).slice(0, 7000))}\n\nAnalyses des spécialistes :\n${stepOutputs.length ? stepOutputs.map((s) => `### ${s.agent} (${s.specialty})\n${s.findings}`).join("\n\n") : "Aucun spécialiste mobilisé (traitement direct par l'agent principal)."}`;

    const leadRes = await runRoutedCompletion(admin, ownerId, leadSystem, leadPrompt, missionId);
    totalTokens += leadRes.tokensUsed;

    const structured = parseJsonBlock<StructuredDiagnosticReport>(leadRes.text) ?? {
      observed_facts: ["Rapport consolidé généré à partir du contexte disponible."],
      confirmed_cause: "Non confirmée — voir le détail du rapport.",
      hypotheses: [],
      missing_info: [],
      affected_files: [],
      solution: [],
      risks: [],
      requires_approval: false,
      proposed_action: null,
    };

    const markdownReport = [
      `## Faits observés`,
      ...(structured.observed_facts.length ? structured.observed_facts.map((x) => `- ${x}`) : ["- Aucun fait technique externe vérifié."]),
      `\n## Cause confirmée`,
      structured.confirmed_cause || "Non confirmée.",
      `\n## Hypothèses`,
      ...(structured.hypotheses.length ? structured.hypotheses.map((x) => `- ${x}`) : ["- Aucune hypothèse supplémentaire."]),
      `\n## Informations manquantes`,
      ...(structured.missing_info.length ? structured.missing_info.map((x) => `- ${x}`) : ["- Aucune."]),
      ...(structured.affected_files.length ? [`\n## Fichiers concernés`, ...structured.affected_files.map((x) => `- \`${x}\``)] : []),
      `\n## Solution recommandée`,
      ...(structured.solution.length ? structured.solution.map((x, i) => `${i + 1}. ${x}`) : ["- Vérifier les informations manquantes avant action."]),
      `\n## Risques`,
      ...(structured.risks.length ? structured.risks.map((x) => `- ${x}`) : ["- Aucun risque critique signalé."]),
    ].join("\n");

    if (leadStep) {
      await admin
        .from("mission_steps")
        .update({ status: "completed", output_summary: markdownReport.slice(0, 4000), completed_at: new Date().toISOString() })
        .eq("id", leadStep.id);
    }

    let finalStatus: "completed" | "awaiting_approval" = "completed";
    if (structured.requires_approval && structured.proposed_action) {
      finalStatus = "awaiting_approval";
      const pa = structured.proposed_action;
      const { data: appr } = await admin
        .from("approvals")
        .insert({
          owner_id: ownerId,
          mission_id: missionId,
          project_id: projectId,
          action_type: pa.action_type,
          title: pa.title,
          operation: pa.operation,
          target_repo: pa.target_repo ?? project?.github_repo ?? null,
          target_files: pa.target_files ?? [],
          risk_level: pa.risk_level ?? "medium",
          risk_summary: pa.risk_summary,
          expected_result: pa.expected_result,
          status: "pending",
        })
        .select("id")
        .single();

      if (appr) {
        await notifyOwnerTelegram(
          admin,
          ownerId,
          "approval",
          `🔐 <b>Approbation requise</b>\nMission : ${mission.title}\nAction : ${pa.title}\nRisque : ${pa.risk_summary}\nRépondez /approve ${appr.id.slice(0, 8)} ou validez sur le web.`,
        ).catch(() => {});
      }
    }

    await admin
      .from("missions")
      .update({
        status: finalStatus,
        progress: finalStatus === "completed" ? 100 : 85,
        final_report: markdownReport,
        structured_report: structured,
        tokens_used: totalTokens,
        completed_at: finalStatus === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", missionId);

    await admin.from("audit_logs").insert({
      owner_id: ownerId,
      actor_type: "agent",
      actor_name: lead?.name ?? "Vigilia Lead",
      action: "mission_executed",
      resource_type: "mission",
      resource_id: missionId,
      details: { status: finalStatus, specialists: activeSpecialists.map((s) => s.slug), tokens_used: totalTokens },
    });

    if (finalStatus === "completed") {
      await notifyOwnerTelegram(
        admin,
        ownerId,
        "mission",
        `✅ <b>Mission terminée</b> : ${mission.title}\nCause : ${structured.confirmed_cause.slice(0, 300)}`,
      ).catch(() => {});
    }

    return { status: finalStatus, structured, report: markdownReport };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur d'exécution de la mission";
    await admin
      .from("missions")
      .update({ status: "failed", final_report: `## Échec de la mission\n${msg}`, updated_at: new Date().toISOString() })
      .eq("id", missionId);
    throw e;
  }
}