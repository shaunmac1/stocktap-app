import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Public Supabase config. The anon key is a publishable key — it ships in every
// built bundle by design and is safe in source. These committed fallbacks mean
// a build never silently ships without a database URL just because a local .env
// (which is gitignored) is missing in a fresh checkout. Set VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY to override (e.g. pointing at a local test proxy).
const FALLBACK_SUPABASE_URL = "https://nyqohgaxvqypdvdmpyix.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55cW9oZ2F4dnF5cGR2ZG1weWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTA5NjUsImV4cCI6MjA5ODQ4Njk2NX0.I3LUpSbwiYnRj7_-4XOyuU02smoQkZTrz7Rbng6Lfso";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
