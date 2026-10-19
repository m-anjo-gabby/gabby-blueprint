// packages/types/dataDeletion.ts
// 退会（fn_withdraw_user）・顧客単位の一括削除（fn_purge_client）の戻り値。規約は docs/DATA-DELETION.md

/** 顧客単位の一括削除で消える件数（fn_purge_client の counts） */
export interface PurgeClientCounts {
  students: number;
  coaches: number;
  invitations: number;
  contracts: number;
  licenses: number;
  sessions: number;
  trainings: number;
  chat_messages: number;
  notices: number;
  calendar_events: number;
}

/** DB の削除に合わせて消す Storage のファイル（バケットごとのパス） */
export interface DeletedStoragePaths {
  profile?: string[];
  homework?: string[];
  chat?: string[];
}

/** fn_purge_client の戻り値（p_dry_run = true の場合は counts だけ） */
export interface PurgeClientResult {
  counts: PurgeClientCounts;
  /** 削除した顧客に所属していたユーザー（認証のアカウントを消す対象） */
  user_ids?: string[];
  storage?: DeletedStoragePaths;
}

/** fn_withdraw_user の戻り値 */
export interface WithdrawUserResult {
  storage?: DeletedStoragePaths;
  counts?: Record<string, number>;
}
