import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 font-mono text-[color:var(--color-neon-green)]">
          <span className="pulse-glow h-2 w-2 rounded-full bg-[color:var(--color-neon-green)] text-[color:var(--color-neon-green)]" />
          <span className="text-xs uppercase tracking-[0.35em]">webiox</span>
        </div>

        <div className="rounded-xl border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-panel)]/80 p-8 shadow-[0_0_60px_-20px_var(--color-neon-green-dim)] backdrop-blur">
          <div className="mb-6 text-center">
            <h1 className="font-mono text-lg uppercase tracking-[0.3em] text-[color:var(--color-text-primary)]">
              War Room Access
            </h1>
            <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">
              Authenticate to deploy your agent squad.
            </p>
          </div>

          <LoginForm />

          <p className="mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-[color:var(--color-text-muted)]">
            // unauthorized access logged
          </p>
        </div>
      </div>
    </div>
  );
}
