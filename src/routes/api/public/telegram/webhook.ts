import { createFileRoute } from '@tanstack/react-router';

type TgUpdate = { update_id: number; message?: { chat: { id: number }; from?: { id: number }; text?: string } };

export const Route = createFileRoute('/api/public/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = new URL(request.url).searchParams.get('o') ?? '';
        if (!/^[0-9a-f-]{36}$/i.test(ownerId)) return new Response('Bad request', { status: 400 });
        const { supabaseAdmin: a } = await import('@/integrations/supabase/client.server');
        const { sha256Base64Url, timingSafeEqualStr, decryptSecret } = await import('@/lib/crypto.server');
        const { data: link } = await a.from('telegram_links').select('*').eq('owner_id', ownerId).maybeSingle();
        const provided = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
        if (!link?.webhook_secret_hash || !link.encrypted_bot_token || !timingSafeEqualStr(await sha256Base64Url(provided), link.webhook_secret_hash)) return new Response('Unauthorized', { status: 401 });
        const upd = (await request.json()) as TgUpdate;
        const msg = upd.message;
        if (!msg?.text) return Response.json({ ok: true });
        // anti-replay: update_id is the primary key
        const ins = await a.from('telegram_messages').insert({ update_id: upd.update_id, owner_id: ownerId, chat_id: msg.chat.id, user_id: msg.from?.id ?? null, direction: 'in', text: msg.text.slice(0, 4000) });
        if (ins.error) return Response.json({ ok: true });
        const { sendTelegramText } = await import('@/lib/telegram/client.server');
        const token = await decryptSecret(link.encrypted_bot_token);
        const reply = (t: string) => sendTelegramText(token, msg.chat.id, t);
        const text = msg.text.trim();

        if (!link.verified) {
          const codeOk = link.verification_code && link.verification_expires_at && Date.parse(link.verification_expires_at) > Date.now() && text.replace(/^\/start\s*/, '') === link.verification_code;
          if (codeOk) {
            await a.from('telegram_links').update({ verified: true, chat_id: msg.chat.id, verification_code: null }).eq('owner_id', ownerId);
            await reply('✅ Chat lié à Vigilia. Commandes : /status, /incidents, /missions, /mission <demande>, /approve <id>, /reject <id>');
          } else await reply('Envoyez le code de vérification affiché dans Vigilia.');
          return Response.json({ ok: true });
        }
        if (Number(link.chat_id) !== msg.chat.id) return Response.json({ ok: true });

        const [cmd, ...rest] = text.split(/\s+/);
        const arg = rest.join(' ');
        if (cmd === '/status') {
          const { data: m } = await a.from('monitors').select('name,last_status').eq('owner_id', ownerId);
          const down = (m ?? []).filter((x) => x.last_status === 'down');
          await reply(`📊 ${m?.length ?? 0} contrôles, ${down.length} en panne${down.length ? '\n' + down.map((d) => '• ' + d.name).join('\n') : ''}`);
        } else if (cmd === '/incidents') {
          const { data } = await a.from('incidents').select('title,severity').eq('owner_id', ownerId).neq('status', 'resolved').limit(10);
          await reply(data?.length ? data.map((i) => `• [${i.severity}] ${i.title}`).join('\n') : 'Aucun incident ouvert.');
        } else if (cmd === '/missions') {
          const { data } = await a.from('missions').select('title,status').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(8);
          await reply(data?.length ? data.map((i) => `• ${i.title} — ${i.status}`).join('\n') : 'Aucune mission.');
        } else if (cmd === '/mission' && arg.length > 3) {
          const { containsSecret } = await import('@/lib/crypto.server');
          if (containsSecret(arg)) { await reply('Retirez les secrets de votre demande.'); return Response.json({ ok: true }); }
          const { data: mission } = await a.from('missions').insert({ owner_id: ownerId, title: arg.slice(0, 120), description: arg, source: 'telegram' }).select('id').single();
          await reply('🛰️ Mission créée, analyse en cours…');
          if (mission) {
            const { executeMissionPipeline } = await import('@/lib/ai/orchestrator.server');
            executeMissionPipeline(a, ownerId, mission.id).catch((e) => console.error(e));
          }
        } else if ((cmd === '/approve' || cmd === '/reject') && arg.length >= 6) {
          const { data: list } = await a.from('approvals').select('id,status,expires_at,title').eq('owner_id', ownerId).eq('status', 'pending');
          const ap = (list ?? []).find((x) => x.id.startsWith(arg.toLowerCase()));
          if (!ap || Date.parse(ap.expires_at) <= Date.now()) await reply('Approbation introuvable ou expirée.');
          else {
            await a.from('approvals').update({ status: cmd === '/approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decision_note: 'Via Telegram' }).eq('id', ap.id).eq('status', 'pending');
            await a.from('audit_logs').insert({ owner_id: ownerId, actor_type: 'telegram', actor_name: 'Telegram', action: cmd === '/approve' ? 'approval_granted' : 'approval_rejected', resource_type: 'approval', resource_id: ap.id });
            await reply(`${cmd === '/approve' ? '✅ Approuvé' : '❌ Refusé'} : ${ap.title}`);
          }
        } else {
          await reply('Commandes : /status, /incidents, /missions, /mission <demande>, /approve <id>, /reject <id>');
        }
        return Response.json({ ok: true });
      },
    },
  },
});
