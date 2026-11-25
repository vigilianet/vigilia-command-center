import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Shield, Lock, Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { pageHead } from "@/lib/workspace/head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  head: () => pageHead("Connexion", "Accès personnel sécurisé au centre de commandement technique Vigilia."),
  component: LoginPage,
});

function GoogleLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleOAuth(provider: "google" | "lovable") {
    setBusy(true);
    setNotice(null);
    try {
      const res = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (res.error) {
        toast.error(res.error.message || "Échec de l'authentification.");
        return;
      }
      if (res.redirected) return;
      void navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) { toast.error("Veuillez saisir votre adresse e-mail."); return; }
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.");
        return;
      }
      if (password.length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Compte créé. Vérifiez votre boîte e-mail et cliquez sur le lien de confirmation avant de vous connecter.");
          return;
        }
        void navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        void navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-signal px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Shield className="size-6" />
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Vigilia Command Center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Accès propriétaire</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Surveillance réelle, diagnostics IA et approbations sécurisées.
          </p>
        </div>

        <Card className="border-border/80 bg-card/90 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === "signin" ? "Connexion" : mode === "signup" ? "Créer le compte propriétaire" : "Mot de passe oublié"}
            </CardTitle>
            <CardDescription>
              {mode === "forgot"
                ? "Recevez un lien sécurisé pour définir un nouveau mot de passe."
                : "Espace réservé au compte propriétaire autorisé."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notice && (
              <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{notice}</span>
              </div>
            )}

            {mode !== "forgot" && (
              <div className="space-y-2.5">
                <Button type="button" disabled={busy} onClick={() => handleOAuth("google")} className="btn-google-dark h-10 w-full">
                  <GoogleLogo />
                  <span>Continuer avec Google</span>
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => handleOAuth("lovable")} className="h-10 w-full gap-2.5">
                  <LovableMark className="size-[18px]" />
                  <span>Continuer avec Lovable</span>
                </Button>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou par e-mail</span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="email">Adresse e-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@domaine.com" className="pl-9" />
                </div>
              </div>

              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Mot de passe</Label>
                    {mode === "signin" && (
                      <button type="button" onClick={() => { setMode("forgot"); setNotice(null); }} className="text-xs text-primary hover:underline">
                        Mot de passe oublié ?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9" />
                  </div>
                </div>
              )}

              <Button type="submit" disabled={busy} className="h-10 w-full gap-2">
                <span>{busy ? "Traitement…" : mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer le compte" : "Envoyer le lien"}</span>
                <ArrowRight className="size-4" />
              </Button>
            </form>

            <div className="pt-1 text-center text-xs text-muted-foreground">
              {mode === "signin" ? (
                <>Première visite ?{" "}
                  <button type="button" onClick={() => { setMode("signup"); setNotice(null); }} className="font-medium text-primary hover:underline">
                    Créer le compte
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => { setMode("signin"); setNotice(null); }} className="font-medium text-primary hover:underline">
                  Retour à la connexion
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}