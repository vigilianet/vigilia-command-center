import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { ownerOnly } from './workspace.functions';

async function admin() { return (await import('@/integrations/supabase/client.server')).supabaseAdmin; }
async function audit(ownerId: string, actor: string, action: string, resource_type: string, resource_id: string | null, details: Record<string, unknown> = {}) {
  const a = await admin();
  await a.from('audit_logs').insert({ owner_id: ownerId, actor_type: 'user', actor_name: actor, action, resource_type, resource_id, details: details as never });
}

export const deleteRecord = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ kind: z.enum(['project', 'agent', 'monitor', 'memory']), id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const table = ({ project: 'projects', agent: 'ai_agents', monitor: 'monitors', memory: 'memories' } as const)[data.kind];
    if (data.kind === 'agent') {
      const { data: a } = await context.supabase.from('ai_agents').select('is_builtin').eq('id', data.id).single();
      if (a?.is_builtin) throw new Error('Les agents intégrés peuvent être désactivés, pas supprimés.');
    }
    const q = await context.supabase.from(table).delete().eq('id', data.id);
    if (q.error) throw new Error(q.error.message);
    await audit(context.userId, context.email, `${data.kind}_deleted`, data.kind, data.id);
    return { ok: true };
  });

export const setIncidentStatus = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ id: z.uuid(), status: z.enum(['open', 'in_progress', 'resolved']) }))
  .handler(async ({ data, context }) => {
    const q = await context.supabase.from('incidents').update({ status: data.status, resolved_at: data.status === 'resolved' ? new Date().toISOString() : null }).eq('id', data.id).select('id').single();
    if (q.error) throw new Error(q.error.message);
    await context.supabase.from('incident_events').insert({ incident_id: data.id, owner_id: context.userId, message: `Statut changé : ${data.status}` });
    return { ok: true };
  });

export const executeApproval = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ id: z.uuid(), baseBranch: z.string().min(1).max(100).default('main'), newBranch: z.string().regex(/^[\w./-]{1,100}$/) }))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: ap } = await a.from('approvals').select('*').eq('id', data.id).eq('owner_id', context.userId).single();
    if (!ap || ap.status !== 'approved') throw new Error('Cette action doit d’abord être approuvée.');
    if (ap.action_type !== 'github_write' || !ap.target_repo) throw new Error('Seule la création de branche GitHub est exécutable automatiquement. Les autres actions restent manuelles.');
    const gh = await import('@/lib/github/client.server');
    const token = await gh.getOwnerGithubToken(a, context.userId);
    if (!token) throw new Error('Connectez GitHub avec un jeton autorisé en écriture.');
    try {
      const r = await gh.executeApprovedGithubBranchCreate(token, ap.target_repo, data.baseBranch, data.newBranch);
      await a.from('approvals').update({ status: 'executed', executed_at: new Date().toISOString(), execution_result: r }).eq('id', ap.id);
      await audit(context.userId, context.email, 'approval_executed', 'approval', ap.id, r);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Échec';
      await a.from('approvals').update({ execution_result: { error: msg } }).eq('id', ap.id);
      throw e;
    }
  });

export const connectGithub = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ token: z.string().min(20).max(300) }))
  .handler(async ({ data, context }) => {
    const gh = await import('@/lib/github/client.server');
    const { encryptSecret } = await import('@/lib/crypto.server');
    const res = await gh.githubFetch('user', data.token);
    const a = await admin();
    const ok = res.ok;
    const user = ok ? ((await res.json()) as { login?: string }) : null;
    const row = { owner_id: context.userId, provider: 'github', name: 'GitHub', status: ok ? 'connected' : 'error', config: { login: user?.login ?? null }, encrypted_credentials: ok ? await encryptSecret(data.token) : null, last_tested_at: new Date().toISOString(), last_error: ok ? null : `GitHub a refusé le jeton (${res.status})`, updated_at: new Date().toISOString() };
    const { data: existing } = await a.from('integrations').select('id').eq('owner_id', context.userId).eq('provider', 'github').maybeSingle();
    const q = existing ? await a.from('integrations').update(row).eq('id', existing.id) : await a.from('integrations').insert(row);
    if (q.error) throw new Error(q.error.message);
    await audit(context.userId, context.email, ok ? 'github_connected' : 'github_failed', 'integration', null);
    if (!ok) throw new Error(row.last_error ?? 'Échec');
    return { login: user?.login ?? null };
  });

export const testIntegration = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: integ } = await a.from('integrations').select('*').eq('id', data.id).eq('owner_id', context.userId).single();
    if (!integ) throw new Error('Intégration introuvable');
    let ok = false, err: string | null = null;
    if (integ.provider === 'github' && integ.encrypted_credentials) {
      const { decryptSecret } = await import('@/lib/crypto.server');
      const gh = await import('@/lib/github/client.server');
      const r = await gh.githubFetch('user', await decryptSecret(integ.encrypted_credentials));
      ok = r.ok; if (!ok) err = `GitHub ${r.status}`;
    } else err = 'Test automatique indisponible pour ce type.';
    await a.from('integrations').update({ status: ok ? 'connected' : 'error', last_error: err, last_tested_at: new Date().toISOString() }).eq('id', integ.id);
    if (!ok) throw new Error(err ?? 'Échec');
    return { ok };
  });

export const disconnectIntegration = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const q = await a.from('integrations').delete().eq('id', data.id).eq('owner_id', context.userId);
    if (q.error) throw new Error(q.error.message);
    await audit(context.userId, context.email, 'integration_removed', 'integration', data.id);
    return { ok: true };
  });

export const inspectRepo = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ repo: z.string().min(3).max(200) }))
  .handler(async ({ data, context }) => {
    const gh = await import('@/lib/github/client.server');
    const token = await gh.getOwnerGithubToken(await admin(), context.userId);
    return gh.inspectGithubRepo(gh.parseRepoSlug(data.repo), token);
  });

export const connectTelegram = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ token: z.string().regex(/^\d{6,12}:[A-Za-z0-9_-]{30,}$/, 'Format de jeton Telegram invalide') }))
  .handler(async ({ data, context }) => {
    const tg = await import('@/lib/telegram/client.server');
    const { encryptSecret, sha256Base64Url } = await import('@/lib/crypto.server');
    const v = await tg.validateBotToken(data.token);
    if (!v.ok) throw new Error(v.error ?? 'Jeton refusé par Telegram');
    const origin = new URL(getRequest().url).origin;
    const webhookUrl = `${origin}/api/public/telegram/webhook?o=${context.userId}`;
    const secret = await tg.deriveWebhookSecret(context.userId, await sha256Base64Url(data.token));
    const reg = await tg.registerTelegramWebhook(data.token, webhookUrl, secret);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const a = await admin();
    const row = { owner_id: context.userId, encrypted_bot_token: await encryptSecret(data.token), webhook_secret_hash: await sha256Base64Url(secret), bot_username: v.username ?? null, webhook_url: webhookUrl, webhook_active: reg.ok, verified: false, chat_id: null, verification_code: code, verification_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), last_error: reg.ok ? null : reg.error ?? 'Webhook non enregistré', updated_at: new Date().toISOString() };
    const q = await a.from('telegram_links').upsert(row, { onConflict: 'owner_id' });
    if (q.error) throw new Error(q.error.message);
    const { data: existing } = await a.from('integrations').select('id').eq('owner_id', context.userId).eq('provider', 'telegram').maybeSingle();
    const integ = { owner_id: context.userId, provider: 'telegram', name: 'Telegram', status: reg.ok ? 'connected' : 'error', config: { bot: v.username ?? null }, last_tested_at: new Date().toISOString(), last_error: row.last_error };
    if (existing) await a.from('integrations').update(integ).eq('id', existing.id); else await a.from('integrations').insert(integ);
    await audit(context.userId, context.email, 'telegram_connected', 'integration', null, { bot: v.username });
    return { bot: v.username ?? null, code, webhook: reg.ok, error: reg.ok ? null : reg.error ?? null };
  });

export const updateTelegramPrefs = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ notify_incidents: z.boolean(), notify_missions: z.boolean(), notify_approvals: z.boolean() }))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const q = await a.from('telegram_links').update({ ...data, updated_at: new Date().toISOString() }).eq('owner_id', context.userId);
    if (q.error) throw new Error(q.error.message);
    return { ok: true };
  });

export const testTelegram = createServerFn({ method: 'POST' }).middleware([ownerOnly]).handler(async ({ context }) => {
  const tg = await import('@/lib/telegram/client.server');
  const ok = await tg.notifyOwnerTelegram(await admin(), context.userId, 'mission', '🛰️ <b>Vigilia</b> : test de notification réussi.');
  if (!ok) throw new Error('Envoi impossible : le bot doit être lié et vérifié (envoyez le code au bot).');
  return { ok };
});

export const disconnectTelegram = createServerFn({ method: 'POST' }).middleware([ownerOnly]).handler(async ({ context }) => {
  const a = await admin();
  await a.from('telegram_links').delete().eq('owner_id', context.userId);
  await a.from('integrations').delete().eq('owner_id', context.userId).eq('provider', 'telegram');
  await audit(context.userId, context.email, 'telegram_disconnected', 'integration', null);
  return { ok: true };
});

export const askAssistant = createServerFn({ method: 'POST' }).middleware([ownerOnly])
  .inputValidator(z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(30) }))
  .handler(async ({ data, context }) => {
    const { containsSecret } = await import('@/lib/crypto.server');
    const last = data.messages[data.messages.length - 1]!;
    if (containsSecret(last.content)) throw new Error('Retirez les secrets de votre message.');
    const s = context.supabase;
    const [p, inc, m] = await Promise.all([
      s.from('projects').select('name,status,url,github_repo').limit(30),
      s.from('incidents').select('title,severity,status,started_at').neq('status', 'resolved').limit(20),
      s.from('monitors').select('name,url,last_status,last_response_ms').limit(40),
    ]);
    const system = `Tu es Vigilia Lead, assistant technique personnel. Réponds en français, de façon concise et structurée (markdown). Sépare faits et hypothèses. Ne prétends jamais avoir exécuté une action. Pour un travail long (diagnostic approfondi, plusieurs spécialistes), propose de créer une mission.\nContexte réel :\nProjets: ${JSON.stringify(p.data ?? [])}\nIncidents ouverts: ${JSON.stringify(inc.data ?? [])}\nContrôles: ${JSON.stringify(m.data ?? [])}`;
    const prompt = data.messages.map((x) => `${x.role === 'user' ? 'Utilisateur' : 'Vigilia'}: ${x.content}`).join('\n\n');
    const { runRoutedCompletion } = await import('@/lib/ai/providers.server');
    const r = await runRoutedCompletion(await admin(), context.userId, system, prompt);
    return { text: r.text, provider: r.providerLabel, model: r.model };
  });
