// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquants. " +
      "Vérifie ton .env.local en local et les variables d'env sur Vercel."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
