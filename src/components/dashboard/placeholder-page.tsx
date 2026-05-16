import { TopBar } from "@/components/dashboard/topbar";

export function PlaceholderPage({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <>
      <TopBar title={title} />
      <div className="p-6">
        <div className="panel flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // module
          </div>
          <h1 className="font-mono text-xl uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
            {title}
          </h1>
          <p className="text-sm text-[color:var(--color-text-secondary)]">
            {hint ?? "coming online…"}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-neon-green)]">
            <span className="pulse-glow h-1.5 w-1.5 rounded-full bg-[color:var(--color-neon-green)] text-[color:var(--color-neon-green)]" />
            standby
          </div>
        </div>
      </div>
    </>
  );
}
