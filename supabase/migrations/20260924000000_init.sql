-- What's Next? — schema
-- Every table is private to its owner via row level security.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  -- settings, onboarding state, plans ("tomorrow starts with"), learned affinities
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  deadline date,
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  notes text not null default '',
  due timestamptz,
  due_has_time boolean not null default false,
  effort_minutes integer not null default 30 check (effort_minutes between 1 and 1440),
  effort_guessed boolean not null default true,
  category text not null default 'other' check (category in ('deep', 'outreach', 'admin', 'learning', 'meeting', 'other')),
  person text,
  status text not null default 'open' check (status in ('open', 'done')),
  blocked_by uuid[] not null default '{}',
  blocked_until timestamptz,
  snoozed_until timestamptz,
  user_bias real not null default 0,
  not_important smallint not null default 0,
  focus_ms bigint not null default 0,
  locked text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- "How much did this move things forward?" 0 = little, 1 = some, 2 = a lot
-- task_id / goal_id are plain references on purpose: learning history outlives
-- the tasks and goals it came from, and sync never blocks on a deleted parent.
create table if not exists public.task_ratings (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid not null,
  value smallint not null check (value between 0 and 2),
  hour smallint not null check (hour between 0 and 23),
  category text not null default 'other',
  goal_id uuid,
  keywords text[] not null default '{}',
  effort_minutes integer not null default 30,
  created_at timestamptz not null default now()
);

-- One-tap reasons behind "Not now"
create table if not exists public.skip_reasons (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid not null,
  reason text not null check (reason in ('no_time', 'low_energy', 'blocked', 'not_important')),
  hour smallint not null check (hour between 0 and 23),
  category text not null default 'other',
  created_at timestamptz not null default now()
);

-- The optional personal profile. One per user, private, deletable any time.
create table if not exists public.knowledge_base (
  user_id uuid primary key references public.users (id) on delete cascade,
  raw text not null default '',
  fields jsonb not null default '[]'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists ratings_user_idx on public.task_ratings (user_id, created_at desc);
create index if not exists skips_user_idx on public.skip_reasons (user_id, created_at desc);

-- Row level security: you only ever see your own rows.
alter table public.users enable row level security;
alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.task_ratings enable row level security;
alter table public.skip_reasons enable row level security;
alter table public.knowledge_base enable row level security;

create policy "own profile" on public.users for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own goals" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasks" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own ratings" on public.task_ratings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own skips" on public.skip_reasons for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own knowledge" on public.knowledge_base for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create the profile row as soon as someone signs up (anonymous or email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
