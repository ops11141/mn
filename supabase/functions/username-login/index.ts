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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { username, password } = await req.json();
    if (typeof username !== "string" || typeof password !== "string" ||
        !/^\d{1,32}$/.test(username.trim()) || password.length < 1 || password.length > 256) {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      console.error("Missing required function secrets");
      return json({ error: "خدمة تسجيل الدخول غير مكتملة الإعداد." }, 500);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await adminClient
      .from("admin_profiles")
      .select("user_id")
      .ilike("username", username.trim())
      .maybeSingle();

    if (profileError || !profile) {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
    }

    const { data: userResult, error: userError } = await adminClient.auth.admin.getUserById(profile.user_id);
    const email = userResult?.user?.email;
    if (userError || !email) {
      console.error("Admin user lookup failed");
      return json({ error: "تعذر تسجيل الدخول. راجع إعداد حساب المشرف." }, 401);
    }

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
    }

    return json({ session: data.session });
  } catch (error) {
    console.error("Username login request failed", error);
    return json({ error: "تعذر تسجيل الدخول حاليًا." }, 400);
  }
});
