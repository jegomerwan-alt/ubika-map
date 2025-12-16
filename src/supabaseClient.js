// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// On récupère les variables Vite (local + Vercel)
const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// On nettoie les espaces / retours à la ligne éventuels
const supabaseUrl = rawUrl ? rawUrl.trim() : "";
const supabaseAnonKey = rawKey ? rawKey.trim() : "";

// Petits logs de debug (tu pourras les enlever plus tard)
console.log("[Supabase] URL reçue =", JSON.stringify(supabaseUrl));
console.log(
  "[Supabase] Anon key définie ?",
  supabaseAnonKey ? "oui" : "non"
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquants / invalides. " +
      "Vérifie ton .env.local et tes variables d'env Vercel."
  );
  throw new Error("Supabase URL / key manquantes");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
