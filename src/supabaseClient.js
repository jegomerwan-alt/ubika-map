import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Supabase env vars manquantes :", {
    supabaseUrl,
    hasAnonKey: !!supabaseAnonKey,
  });
  throw new Error(
    "Supabase non configuré : vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
