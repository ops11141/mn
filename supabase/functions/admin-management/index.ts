import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
function findKey(value: unknown, prefix: string): string | undefined {
  if (typeof value === "string") {
    if (value.startsWith(prefix)) return value;
    try { return findKey(JSON.parse(value), prefix); } catch { return undefined; }
  }
  if (Array.isArray(value)) {
    for (const item of value) { const found = findKey(item, prefix); if (found) return found; }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findKey(item, prefix); if (found) return found;
    }
  }
  return undefined;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      findKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), "sb_publishable_") ||
      findKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), "eyJ");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      findKey(Deno.env.get("SUPABASE_SECRET_KEYS"), "sb_secret_") ||
      findKey(Deno.env.get("SUPABASE_SECRET_KEYS"), "eyJ");
    if (!url || !anonKey || !serviceKey) return reply({ error: "إعدادات الدالة غير مكتملة." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "يلزم تسجيل الدخول أولًا." }, 401);
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return reply({ error: "جلسة الدخول غير صالحة." }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: owner, error: ownerError } = await admin.from("admin_profiles")
      .select("is_superadmin,is_active").eq("user_id", userData.user.id).maybeSingle();
    if (ownerError || !owner?.is_superadmin || owner.is_active === false) {
      return reply({ error: "هذه الصفحة متاحة للمشرف الرئيسي فقط." }, 403);
    }

    const payload = await req.json();
    const action = String(payload?.action || "");
    if (action === "list") {
      const { data, error } = await admin.from("admin_profiles")
        .select("user_id,username,display_name,is_active,is_superadmin,created_at")
        .order("created_at", { ascending: true });
      if (error) return reply({ error: "تعذر تحميل قائمة المشرفين." }, 500);
      return reply({ admins: data || [] });
    }

    if (action === "create") {
      const username = typeof payload?.username === "string" ? payload.username.trim() : "";
      const displayName = typeof payload?.display_name === "string" ? payload.display_name.trim() : "";
      const password = typeof payload?.password === "string" ? payload.password : "";
      if (!/^\d{1,32}$/.test(username)) return reply({ error: "اسم المستخدم يجب أن يكون أرقامًا فقط." }, 400);
      if (!/^\d{6,128}$/.test(password)) return reply({ error: "كلمة المرور يجب أن تكون أرقامًا فقط وبطول 6 خانات على الأقل." }, 400);
      if (!displayName || displayName.length > 100) return reply({ error: "أدخل اسم المشرف بحد أقصى 100 حرف." }, 400);
      const { data: existing, error: existingError } = await admin.from("admin_profiles")
        .select("user_id").eq("username", username).maybeSingle();
      if (existingError) return reply({ error: "تعذر التحقق من اسم المستخدم." }, 500);
      if (existing) return reply({ error: "اسم المستخدم مستخدم بالفعل." }, 409);

      // A synthetic, non-deliverable email keeps Supabase Auth working without
      // requiring the operator to create or manage an email inbox for each admin.
      const email = "admin-" + username + "@faults.example.com";
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: displayName, login_username: username },
      });
      if (createError || !created.user) {
        console.error("Admin creation failed", createError?.message);
        return reply({ error: "تعذر إنشاء حساب المشرف. قد يكون اسم المستخدم مستخدمًا في حساب سابق." }, 400);
      }
      const { error: profileError } = await admin.from("admin_profiles").insert({
        user_id: created.user.id, username, display_name: displayName, role: "admin",
        is_active: true, is_superadmin: false,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        console.error("Admin profile creation failed", profileError.message);
        return reply({ error: "تعذر حفظ صلاحيات المشرف، وتم التراجع عن إنشاء الحساب." }, 500);
      }
      return reply({ success: true });
    }

    if (action === "set_active") {
      const userId = typeof payload?.user_id === "string" ? payload.user_id : "";
      const active = payload?.active === true;
      if (!userId || userId === userData.user.id) return reply({ error: "لا يمكن تغيير حالة حسابك من هذه الصفحة." }, 400);
      const { data: target, error: targetError } = await admin.from("admin_profiles")
        .select("user_id,is_superadmin").eq("user_id", userId).maybeSingle();
      if (targetError || !target) return reply({ error: "لم يتم العثور على المشرف." }, 404);
      if (target.is_superadmin) return reply({ error: "لا يمكن تعطيل حساب المشرف الرئيسي." }, 403);
      const { error: updateError } = await admin.from("admin_profiles").update({ is_active: active }).eq("user_id", userId);
      if (updateError) return reply({ error: "تعذر تحديث حالة المشرف." }, 500);
      if (!active) {
        const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
        if (banError) {
          await admin.from("admin_profiles").update({ is_active: true }).eq("user_id", userId);
          return reply({ error: "تعذر إيقاف جلسات الحساب، لم يتم تعطيله." }, 500);
        }
      } else {
        const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
        if (unbanError) {
          await admin.from("admin_profiles").update({ is_active: false }).eq("user_id", userId);
          return reply({ error: "تعذر إعادة تفعيل الحساب." }, 500);
        }
      }
      return reply({ success: true });
    }
    return reply({ error: "إجراء غير معروف." }, 400);
  } catch (error) {
    console.error("Admin management request failed", error);
    return reply({ error: "حدث خطأ غير متوقع أثناء إدارة المشرفين." }, 400);
  }
});
