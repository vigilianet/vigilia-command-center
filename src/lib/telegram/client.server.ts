import { decryptSecret, sha256Base64Url } from "@/lib/crypto.server";

const TG_API = "https://api.telegram.org";

export async function deriveWebhookSecret(ownerId: string, tokenHash: string): Promise<string> {
  return (await sha256Base64Url(`vigilia-tg-wh:${ownerId}:${tokenHash}`)).slice(0, 64);
}

export async function validateBotToken(token: string): Promise<{ ok: boolean; username?: string | undefined; botId?: number | undefined; error?: string | undefined }> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const json = (await res.json()) as { ok: boolean; result?: { id: number; username?: string }; description?: string };
    if (!res.ok || !json.ok || !json.result) {
      return { ok: false, error: json.description ?? `Erreur Telegram (${res.status})` };
    }
    return {
      ok: true,
      ...(json.result.username !== undefined ? { username: json.result.username } : {}),
      botId: json.result.id,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Impossible de contacter Telegram" };
  }
}

export async function registerTelegramWebhook(
  token: string,
  webhookUrl: string,
  secretToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ["message", "edited_message"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.description ?? `Échec setWebhook (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau setWebhook" };
  }
}

export async function sendTelegramText(token: string, chatId: number | string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.description ?? `Erreur sendMessage (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Telegram" };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notifyOwnerTelegram(admin: any, ownerId: string, kind: "incident" | "mission" | "approval", htmlMessage: string): Promise<boolean> {
  const { data: link } = await admin
    .from("telegram_links")
    .select("encrypted_bot_token, chat_id, verified, notify_incidents, notify_missions, notify_approvals")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!link || !link.verified || !link.chat_id || !link.encrypted_bot_token) return false;
  if (kind === "incident" && !link.notify_incidents) return false;
  if (kind === "mission" && !link.notify_missions) return false;
  if (kind === "approval" && !link.notify_approvals) return false;
  const token = await decryptSecret(link.encrypted_bot_token);
  const sent = await sendTelegramText(token, link.chat_id, htmlMessage);
  return sent.ok;
}