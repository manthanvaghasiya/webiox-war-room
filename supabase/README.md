# Supabase

SQL migrations live in `migrations/`. They are applied **manually** via the Supabase SQL Editor (no CLI dependency yet).

## How to run a migration

1. Open the Supabase dashboard → your project → **SQL Editor**.
2. Click **New query**.
3. Open the migration file (e.g. `migrations/0001_initial_schema.sql`) and paste its full contents.
4. Click **Run**.
5. Confirm there are no errors. Re-running is safe — every statement is idempotent (`create … if not exists`, `drop … if exists`, `on conflict do nothing`).

## What `0001_initial_schema.sql` does

- Creates 9 enums (`lead_status`, `qualified_status`, `deal_stage`, `agent_name`, `agent_state`, `email_direction`, `email_classification`, `call_status`, `log_level`).
- Creates 10 tables under `public`: `profiles`, `settings`, `leads`, `qualified_leads`, `email_messages`, `calls`, `deals`, `clients`, `agent_logs`, `agent_status`.
- Adds indexes for the common access patterns (per-user lists, sorted by `created_at`, lead lookups by email, etc.).
- Installs an `updated_at` `before update` trigger on every table that has an `updated_at` column.
- Adds an `auth.users` `after insert` trigger that:
  - inserts a row into `public.profiles`, and
  - seeds one `agent_status` row per `agent_name` enum value with `state = 'idle'`.
- Enables **RLS** on every table and creates `select`/`insert`/`update`/`delete` policies scoped to `auth.uid()`.

## Verifying after a run

In the SQL Editor:

```sql
-- Tables exist
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

-- RLS is on for every table
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';

-- Sign up a test user from the Auth tab, then:
select * from public.profiles;       -- 1 row
select * from public.agent_status;   -- 8 rows, one per agent
```

## Conventions

- One file per migration, numbered `NNNN_description.sql`. Never edit a migration after it has been applied — add a new one.
- Every table that the app reads/writes must have RLS enabled and policies keyed on `user_id = auth.uid()` (`profiles` is the exception — keyed on `id = auth.uid()`).
- Generated TypeScript row types live in `src/types/database.ts`. Keep them in sync with the schema by hand for now; we'll switch to `supabase gen types` in a later step.
