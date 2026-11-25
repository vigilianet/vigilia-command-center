import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OwnerCtx = {
  userId: string;
  email: string;
};

export function useOwner() {
  return useQuery({
    queryKey: ["owner"],
    queryFn: async (): Promise<OwnerCtx> => {
      const { data: u, error } = await supabase.auth.getUser();
      if (error || !u.user) throw new Error("Non connecté");
      return { userId: u.user.id, email: u.user.email ?? "" };
    },
    staleTime: 60_000,
  });
}