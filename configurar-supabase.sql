begin;
create table if not exists public.chef_recipes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 120),
 category text not null check (category in ('Platos principales','Entradas','Postres','Dips','Desayunos','Pastas','Pizzas','Ensaladas')),
 minutes integer check (minutes between 1 and 10080),
 ingredients jsonb not null check (jsonb_typeof(ingredients)='array' and jsonb_array_length(ingredients) between 1 and 200),
 steps jsonb not null check (jsonb_typeof(steps)='array' and jsonb_array_length(steps) between 1 and 200),
 created_at timestamptz not null default now()
);
create table if not exists public.chef_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 recipe_id text not null check (length(recipe_id) between 1 and 80),
 primary key(user_id,recipe_id)
);
create table if not exists public.chef_photos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 path text not null unique check (path like user_id::text || '/%'),
 created_at timestamptz not null default now()
);
create index if not exists chef_recipes_user_idx on public.chef_recipes(user_id);
create index if not exists chef_photos_user_idx on public.chef_photos(user_id);
alter table public.chef_recipes enable row level security;
alter table public.chef_favorites enable row level security;
alter table public.chef_photos enable row level security;
revoke all on public.chef_recipes,public.chef_favorites,public.chef_photos from anon,authenticated;
grant select,insert,update,delete on public.chef_recipes,public.chef_favorites,public.chef_photos to authenticated;
drop policy if exists chef_recipes_owner on public.chef_recipes;
create policy chef_recipes_owner on public.chef_recipes for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists chef_favorites_owner on public.chef_favorites;
create policy chef_favorites_owner on public.chef_favorites for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists chef_photos_owner on public.chef_photos;
create policy chef_photos_owner on public.chef_photos for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('chef-photos','chef-photos',false,10485760,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg'];
drop policy if exists chef_photo_files_owner on storage.objects;
create policy chef_photo_files_owner on storage.objects for all to authenticated
using (bucket_id='chef-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='chef-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
