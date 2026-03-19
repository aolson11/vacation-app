create table if not exists public.events (
  id bigint generated always as identity primary key,
  date date not null,
  time time not null,
  title text not null,
  category text not null check (category in ('Morning', 'Afternoon', 'Evening')),
  rsvp_count integer not null default 0 check (rsvp_count >= 0)
);

create index if not exists events_date_idx on public.events (date);
create index if not exists events_category_idx on public.events (category);
