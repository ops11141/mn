import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Supabase now exposes key collections as JSON in default function secrets.
// Find the first matching key without ever logging or returning its value.
function findKey(value: unknown, prefix: string): string | undefined {
  if (typeof value === "string") {
    if (value.startsWith(prefix) || (prefix === "eyJ" && value.startsWith("eyJ"))) return value;
    try { return findKey(JSON.parse(value), prefix); } catch { return undefined; }
  }
  if (Array.isArray(value)) {
    for (const item of value) { const found = findKey(item, prefix); if (found) return found; }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findKey(item, prefix);
      if (found) return found;
    }
  }
  return undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const payload = await req.json();
    const username = typeof payload?.username === "string" ? payload.username.trim() : "";
    const password = typeof payload?.password === "string" ? payload.password : "";

    if (!/^\\d{1,32}$/.test(username) || password.length < 1 || password.length > 256) {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const publishableCollection = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const secretCollection = Deno.env.get("SUPABASE_SECRET_KEYS");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      findKey(publishableCollection, "sb_publishable_") ||
      findKey(publishableCollection, "eyJ");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      findKey(secretCollection, "sb_secret_") ||
      findKey(secretCollection, "eyJ");

    if (!url || !anonKey || !serviceKey) {
      console.error("Username login configuration missing", {
        hasUrl: !!url, hasPublishableKey: !!anonKey, hasSecretKey: !!serviceKey
      });
      return json({ error: "إعداد تسجيل الدخول غير مكتمل في Supabase. راجع سجلات الدالة." }, 500);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await adminClient
      .from("admin_profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();

    if (profileError) {
      console.error("Username profile query failed", { code: profileError.code, message: profileError.message });
      return json({ error: "تعذر التحقق من اسم المستخدم بسبب إعدادات قاعدة البيانات." }, 500);
    }
    if (!profile) return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);

    const { data: userResult, error: userError } =
      await adminClient.auth.admin.getUserById(profile.user_id);
    const email = userResult?.user?.email;
    if (userError || !email) {
      console.error("Admin user lookup failed", { message: userError?.message ?? "email missing" });
      return json({ error: "تعذر العثور على حساب تسجيل الدخول المرتبط بهذا المستخدم." }, 500);
    }

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      console.error("Username password sign-in failed", { message: error?.message ?? "session missing", status: error?.status });
      return json({ error: "اسم المستخدم موجود، لكن كلمة المرور غير صحيحة لحساب المشرف." }, 401);
    }

    return json({ session: data.session });
  } catch (error) {
    console.error("Username login request failed", error);
    return json({ error: "تعذر تسجيل الدخول حاليًا." }, 400);
  }
});
