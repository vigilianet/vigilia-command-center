import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/workspace/head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => pageHead("Réinitialiser le mot de passe", "Définissez un nouveau mot de passe pour votre accès Vigilia."),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Utilisez au moins 8 caractères."); return; }
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe mis à jour.");
      void navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de mettre à jour le mot de passe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-signal px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Shield className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-primary" />Récupération de compte</CardTitle>
            <CardDescription>
              {ready ? "Choisissez un nouveau mot de passe fort pour Vigilia." : "Ouvrez cette page depuis le lien reçu par e-mail."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ready ? (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="np">Nouveau mot de passe</Label>
                  <Input id="np" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp">Confirmer le mot de passe</Label>
                  <Input id="cp" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Répétez le mot de passe" />
                </div>
                <Button type="submit" disabled={busy} className="w-full">{busy ? "Enregistrement…" : "Mettre à jour"}</Button>
              </form>
            ) : (
              <Link to="/login" className="text-sm text-primary hover:underline">Retour à la page de connexion</Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}