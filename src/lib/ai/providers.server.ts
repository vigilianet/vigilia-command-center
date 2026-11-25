import { decryptSecret } from "@/lib/crypto.server";

export type ProviderErrorType =
  | "401_invalid"
  | "403_permission"
  | "429_quota"
  | "5xx_unavailable"
  | "network"
  | "prompt_error";

export type ProviderKeyRow = {
  id: string;
  owner_id: string;
  provider: string;
  label: string;
  model_default: string;
  fallback_model: string | null;
  base_url: string | null;
  encrypted_secret: string | null;
  shared_quota_group: string | null;
  enabled: boolean;
  priority: number;
  status: string;
  circuit_open_until: string | null;
  consecutive_failures: number;
  requests_count: number;
  errors_count: number;
  tokens_used: number;
  monthly_token_limit: number;
};

export function classifyProviderError(httpStatus: number | null, message: string): ProviderErrorType {
  if (httpStatus === 401) return "401_invalid";
  if (httpStatus === 403) return "403_permission";
  if (httpStatus === 429) return "429_quota";
  if (httpStatus === 400 || httpStatus === 422) return "prompt_error";
  if (httpStatus !== null && httpStatus >= 500) return "5xx_unavailable";
  if (/timeout|network|fetch failed|econn|enotfound|aborted/i.test(message)) return "network";
  return "5xx_unavailable";
}

export function shouldFailoverOnError(errorType: ProviderErrorType): boolean {
  // Erreur de prompt : jamais de changement de clé !
  return errorType !== "prompt_error";
}

export function isCircuitOpen(key: Pick<ProviderKeyRow, "status" | "circuit_open_until">, nowMs = Date.now()): boolean {
  if (key.status === "disabled" || key.status === "invalid" || key.status === "permission_error") return true;
  if (key.circuit_open_until && new Date(key.circuit_open_until).getTime() > nowMs) return true;
  return false;
}

export function nextCircuitCooldownMs(consecutiveFailures: number, errorType: ProviderErrorType): number {
  if (errorType === "429_quota") return 5 * 60_000;
  if (consecutiveFailures >= 3) return Math.min(15 * 60_000, 60_000 * Math.pow(2, consecutiveFailures - 3));
  return 0;
}

export function selectEligibleKeys(keys: ProviderKeyRow[], nowMs = Date.now()): ProviderKeyRow[] {
  return [...keys]
    .filter((k) => k.enabled && !isCircuitOpen(k, nowMs) && k.tokens_used < k.monthly_token_limit)
    .sort((a, b) => a.priority - b.priority);
}

async function callSingleProvider(
  key: ProviderKeyRow,
  model: string,
  system: string,
  prompt: string,
): Promise<{ text: string; tokensUsed: number }> {
  if (key.provider === "lovable_gateway") {
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const r = await generateResponse({ model: "openai/gpt-6-astra", instructions: system, input: prompt });
      const parts: string[] = [];
      for (const item of (r as { output?: unknown[] }).output ?? []) {
        const content = (item as { content?: unknown[] }).content ?? [];
        for (const c of content) {
          const t = c as { type?: string; text?: string };
          if (t.type === "output_text" && t.text) parts.push(t.text);
        }
      }
      const text = parts.join("\n").trim();
      const usage = (r as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? Math.ceil((system.length + prompt.length + text.length) / 4);
      return { text: text || "Aucune réponse générée.", tokensUsed: usage };
    } catch (e) {
      if (e instanceof GatewayError) {
        const err = new Error(e.message) as Error & { httpStatus?: number };
        err.httpStatus = e.httpStatus ?? 500;
        throw err;
      }
      throw e;
    }
  }

  if (!key.encrypted_secret) {
    const err = new Error("Clé API manquante pour ce fournisseur") as Error & { httpStatus?: number };
    err.httpStatus = 401;
    throw err;
  }
  const apiKey = await decryptSecret(key.encrypted_secret);

  if (key.provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`) as Error & { httpStatus?: number };
      err.httpStatus = res.status;
      throw err;
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n").trim() ?? "";
    return { text: text || "Aucune réponse générée.", tokensUsed: json.usageMetadata?.totalTokenCount ?? 0 };
  }

  if (key.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`) as Error & { httpStatus?: number };
      err.httpStatus = res.status;
      throw err;
    }
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
    const tokens = (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0);
    return { text: text || "Aucune réponse générée.", tokensUsed: tokens };
  }

  // OpenAI, OpenRouter, or custom OpenAI-compatible
  const baseUrl =
    key.provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : key.provider === "custom" && key.base_url
        ? key.base_url
        : "https://api.openai.com/v1/chat/completions";

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`${key.provider} ${res.status}: ${body.slice(0, 200)}`) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return { text: text || "Aucune réponse générée.", tokensUsed: json.usage?.total_tokens ?? 0 };
}

export async function testProviderKey(key: ProviderKeyRow): Promise<{ text: string; tokensUsed: number }> {
  return callSingleProvider(key, key.model_default, "Réponds uniquement OK.", "Test de connexion au fournisseur IA.");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runRoutedCompletion(admin: any, ownerId: string, system: string, prompt: string, missionId?: string): Promise<{ text: string; tokensUsed: number; providerLabel: string; model: string }> {
  const { data: rawKeys } = await admin.from("ai_provider_keys").select("*").eq("owner_id", ownerId).order("priority");
  const candidates = selectEligibleKeys((rawKeys ?? []) as ProviderKeyRow[]);
  if (candidates.length === 0) {
    throw new Error("Aucun fournisseur IA actif disponible (vérifiez vos quotas, clés ou circuit breakers).");
  }

  const exhaustedQuotaGroups = new Set<string>();
  let lastError: Error | null = null;

  for (let idx = 0; idx < candidates.length; idx++) {
    const key = candidates[idx]!;
    if (key.shared_quota_group && exhaustedQuotaGroups.has(key.shared_quota_group)) {
      continue;
    }
    const modelsToTry = [key.model_default, ...(key.fallback_model && key.fallback_model !== key.model_default ? [key.fallback_model] : [])];

    for (const model of modelsToTry) {
      try {
        const res = await callSingleProvider(key, model, system, prompt);
        await admin
          .from("ai_provider_keys")
          .update({
            status: "active",
            consecutive_failures: 0,
            circuit_open_until: null,
            requests_count: key.requests_count + 1,
            tokens_used: key.tokens_used + res.tokensUsed,
            last_used_at: new Date().toISOString(),
            last_error_code: null,
            last_error_message: null,
          })
          .eq("id", key.id);
        return { text: res.text, tokensUsed: res.tokensUsed, providerLabel: key.label, model };
      } catch (e) {
        const err = e instanceof Error ? e : new Error("Erreur fournisseur inconnue");
        const httpStatus = (err as { httpStatus?: number }).httpStatus ?? null;
        const errorType = classifyProviderError(httpStatus, err.message);
        const canSwitch = shouldFailoverOnError(errorType);
        const nextKey = canSwitch ? candidates[idx + 1] : undefined;

        const failures = key.consecutive_failures + 1;
        const cooldownMs = nextCircuitCooldownMs(failures, errorType);
        const newStatus =
          errorType === "401_invalid"
            ? "invalid"
            : errorType === "403_permission"
              ? "permission_error"
              : errorType === "429_quota"
                ? "rate_limited"
                : cooldownMs > 0
                  ? "circuit_open"
                  : key.status;

        await admin
          .from("ai_provider_keys")
          .update({
            status: newStatus,
            consecutive_failures: failures,
            errors_count: key.errors_count + 1,
            circuit_open_until: cooldownMs > 0 ? new Date(Date.now() + cooldownMs).toISOString() : null,
            last_error_code: httpStatus,
            last_error_message: err.message.slice(0, 300),
          })
          .eq("id", key.id);

        await admin.from("ai_failover_logs").insert({
          owner_id: ownerId,
          mission_id: missionId ?? null,
          from_key_id: key.id,
          to_key_id: nextKey?.id ?? null,
          error_type: errorType,
          http_status: httpStatus,
          message: err.message.slice(0, 300),
          switched: Boolean(nextKey),
        });

        if (!canSwitch) {
          throw new Error(`Erreur de requête/prompt (aucune bascule de clé effectuée) : ${err.message}`);
        }
        if (errorType === "429_quota" && key.shared_quota_group) {
          exhaustedQuotaGroups.add(key.shared_quota_group);
        }
        lastError = err;
        if (errorType === "401_invalid" || errorType === "403_permission" || errorType === "429_quota") {
          break; // inutile d'essayer le modèle de secours sur une clé invalide/quota épuisé
        }
      }
    }
  }

  throw lastError ?? new Error("Tous les fournisseurs IA ont échoué.");
}