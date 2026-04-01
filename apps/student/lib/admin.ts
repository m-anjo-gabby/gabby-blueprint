import { createClient } from "@supabase/supabase-js";

// --- 共通の環境変数 ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service Role Keyを使用する管理者クライアント
export const createAdminClient = () => {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error('Supabase URL and/or Service Role Key is missing for admin client.');
    }
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false },
    });
};