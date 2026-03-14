import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wktkamjhpsscdwrktfgz.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrdGthbWpocHNzY2R3cmt0Zmd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODExNjEsImV4cCI6MjA4OTA1NzE2MX0.VuSGwO6Aq1NV03gfPHE9F7iK3Fgbj3rafc9z_dG3dhM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── AUTH HELPERS ──────────────────────────────────────────────────────

// Send magic link to email
export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

// Sign in with password
export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// Sign up with password
export async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data.user;
}

// Sign out
export async function signOut() {
  await supabase.auth.signOut();
}

// Get current session
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Listen to auth state changes
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return data.subscription.unsubscribe;
}

// ── USER PROGRESS IN SUPABASE ─────────────────────────────────────────
// Stores progress in a simple key-value table: user_progress
// Schema: id (uuid), user_id (text), data (jsonb), updated_at (timestamp)

export async function saveProgressToSupabase(userId, progressData) {
  const { error } = await supabase
    .from("user_progress")
    .upsert({
      user_id: userId,
      data: progressData,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (error) console.error("saveProgress:", error);
}

export async function loadProgressFromSupabase(userId) {
  const { data, error } = await supabase
    .from("user_progress")
    .select("data")
    .eq("user_id", userId)
    .single();
  if (error) return null;
  return data?.data || null;
}
