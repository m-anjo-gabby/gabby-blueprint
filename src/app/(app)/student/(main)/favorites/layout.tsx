// src/app/(app)/student/(main)/favorites/layout.tsx

export default function PanelLockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* h-[calc(100dvh-offset)]: 
       画面高からヘッダーと外側パディング分を引いた「完璧な高さ」を計算します。
       モバイル(100px)とPC(140px)で調整。
    */
    <div className="
      relative
      h-[calc(100dvh-100px)] 
      md:h-[calc(100dvh-140px)] 
      w-full 
      overflow-hidden 
      touch-none
    ">
      {/* children（各ページ本体）に touch-auto を持たせることで内部スクロールを許可 */}
      <div className="h-full w-full touch-auto">
        {children}
      </div>
    </div>
  );
}