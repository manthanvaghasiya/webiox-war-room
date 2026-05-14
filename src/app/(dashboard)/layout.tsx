import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
        {/* Sidebar — wired up in a later step */}
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="h-14 border-b bg-card">
          {/* Header — wired up in a later step */}
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
