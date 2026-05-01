// apps/admin/lib/navigation.ts
import { 
  LayoutDashboard, Building2, FileSignature, Users, BookOpen, Speech 
} from 'lucide-react';

export const ADMIN_NAV_CONFIG = [
  { 
    label: 'ダッシュボード', 
    href: '/dashboard', 
    icon: LayoutDashboard, 
    requiredRoles: [] // 全員OK
  },
  { 
    label: '顧客管理', 
    href: '/clients', 
    icon: Building2, 
    requiredRoles: ['admin'] 
  },
  { 
    label: '契約管理', 
    href: '/contracts', 
    icon: FileSignature, 
    requiredRoles: ['admin'] 
  },
  { 
    label: 'ユーザー管理', 
    href: '/users', 
    icon: Users, 
    requiredRoles: ['admin'] 
  },
  { 
    label: '教材管理', 
    href: '/contents', 
    icon: BookOpen, 
    requiredRoles: ['admin', 'content_manager'] 
  },
  { 
    label: 'TTS Designer', 
    href: '/tools/tts-designer', 
    icon: Speech, 
    requiredRoles: ['admin', 'content_manager'] 
  },
] as const;

/**
 * 特定のパスに対して権限があるか判定する共通ロジック
 */
export function canAccessPath(pathname: string, userRoles: string[]): boolean {
  // adminロールは常に全パスOK
  if (userRoles.includes('admin')) return true;

  // 設定から該当するパスを探す
  const config = ADMIN_NAV_CONFIG.find(item => pathname.startsWith(item.href));
  
  // 設定がないパスは「制限なし」とするか、セキュリティ重視なら「拒否」にする
  if (!config || config.requiredRoles.length === 0) return true;

  // ユーザーのロールがいずれか一つでも一致すればOK
  return config.requiredRoles.some(role => userRoles.includes(role));
}