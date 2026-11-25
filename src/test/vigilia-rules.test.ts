import { describe, expect, it } from "vitest";
import { isPrivateIPv4, isPrivateIPv6, assertPublicUrl } from "@/lib/monitoring/ssrf";
import { severityFor, shouldSendIncidentAlert } from "@/lib/monitoring/check";
import { approvalIsUsable, canAnalyzeAgent, safeSlug } from "@/lib/workspace/policy";
import { isProtectedBranch, parseRepoSlug } from "@/lib/github/client.server";
import {
  classifyProviderError,
  shouldFailoverOnError,
  selectEligibleKeys,
  type ProviderKeyRow,
} from "@/lib/ai/providers.server";
import { containsSecret, encryptSecret, decryptSecret, redactSecrets } from "@/lib/crypto.server";

describe("Vigilia security & monitoring rules", () => {
  it("blocks private IPv4/IPv6, localhost, internal hosts, credentials and non-standard ports (SSRF)", async () => {
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("10.0.0.5")).toBe(true);
    expect(isPrivateIPv4("169.254.169.254")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);

    await expect(assertPublicUrl("http://localhost/admin")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1:8080/health")).rejects.toThrow();
    await expect(assertPublicUrl("http://service.internal/status")).rejects.toThrow();
    await expect(assertPublicUrl("https://user:pass@example.com")).rejects.toThrow();
    await expect(assertPublicUrl("https://example.com:5432")).rejects.toThrow();
    await expect(assertPublicUrl("ftp://example.com")).rejects.toThrow();
  });

  it("enforces incident severity and 30-minute anti-repetition cooldown", () => {
    expect(severityFor({ ok: false, status_code: null, response_ms: null, error: "timeout" })).toBe("critical");
    expect(severityFor({ ok: false, status_code: 503, response_ms: 120, error: "503" })).toBe("high");
    expect(severityFor({ ok: false, status_code: 404, response_ms: 80, error: "404" })).toBe("medium");

    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(shouldSendIncidentAlert(null, now)).toBe(true);
    expect(shouldSendIncidentAlert("2026-11-25T11:45:00Z", now)).toBe(false);
    expect(shouldSendIncidentAlert("2026-11-25T11:29:00Z", now)).toBe(true);
  });

  it("enforces approval usability and protected GitHub branch guard", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(approvalIsUsable({ status: "pending", expires_at: "2026-11-25T13:00:00Z" }, now)).toBe(true);
    expect(approvalIsUsable({ status: "pending", expires_at: "2026-11-25T11:00:00Z" }, now)).toBe(false);
    expect(approvalIsUsable({ status: "approved", expires_at: "2026-11-25T13:00:00Z" }, now)).toBe(false);

    expect(isProtectedBranch("main")).toBe(true);
    expect(isProtectedBranch("MASTER")).toBe(true);
    expect(isProtectedBranch("production")).toBe(true);
    expect(isProtectedBranch("vigilia/fix-auth")).toBe(false);
    expect(parseRepoSlug("https://github.com/Landry-kayoyo/vigilia-command-center-98e3812d.git")).toBe(
      "Landry-kayoyo/vigilia-command-center-98e3812d",
    );
    expect(() => parseRepoSlug("invalid-slug")).toThrow();
  });

  it("never fails over on prompt_error and respects provider priority, quotas, and circuit breakers", () => {
    expect(classifyProviderError(400, "Bad request")).toBe("prompt_error");
    expect(shouldFailoverOnError("prompt_error")).toBe(false);
    expect(shouldFailoverOnError("429_quota")).toBe(true);
    expect(shouldFailoverOnError("5xx_unavailable")).toBe(true);

    const now = Date.parse("2026-11-25T12:00:00Z");
    const base: Omit<ProviderKeyRow, "id" | "priority" | "status" | "tokens_used" | "circuit_open_until"> = {
      owner_id: "u1", provider: "openai", label: "K", model_default: "m", fallback_model: null,
      base_url: null, encrypted_secret: null, shared_quota_group: null, enabled: true,
      consecutive_failures: 0, requests_count: 0, errors_count: 0, monthly_token_limit: 1000,
    };
    const eligible = selectEligibleKeys(
      [
        { ...base, id: "open-circuit", priority: 1, status: "rate_limited", tokens_used: 0, circuit_open_until: "2026-11-25T12:05:00Z" },
        { ...base, id: "quota-hit", priority: 2, status: "active", tokens_used: 1000, circuit_open_until: null },
        { ...base, id: "second", priority: 10, status: "active", tokens_used: 100, circuit_open_until: null },
        { ...base, id: "first", priority: 5, status: "active", tokens_used: 100, circuit_open_until: null },
      ],
      now,
    );
    expect(eligible.map((k) => k.id)).toEqual(["first", "second"]);
  });

  it("detects/redacts secrets, encrypts with AES-256-GCM, and scopes agent permissions", async () => {
    expect(containsSecret("voici mon token ghp_1234567890abcdefghij123456")).toBe(true);
    expect(containsSecret("bot 123456789:AAH1234567890abcdefghijklmnopqr_st")).toBe(true);
    expect(containsSecret("Vérifie le statut du site de production")).toBe(false);
    expect(redactSecrets("clé sk-1234567890abcdefghijklmno")).toBe("clé [SECRET_MASQUÉ]");

    const enc = await encryptSecret("mon-jeton-secret", "test-master-key-vigilia");
    expect(enc).not.toContain("mon-jeton-secret");
    expect(await decryptSecret(enc, "test-master-key-vigilia")).toBe("mon-jeton-secret");

    expect(canAnalyzeAgent({ enabled: true, permissions: { read: true, analyze: true }, allowed_project_ids: ["p1"] }, "p1")).toBe(true);
    expect(canAnalyzeAgent({ enabled: true, permissions: { read: true, analyze: true }, allowed_project_ids: ["p1"] }, "p2")).toBe(false);
    expect(safeSlug("Équipe Réseaux & API")).toBe("equipe-reseaux-api");
  });
});