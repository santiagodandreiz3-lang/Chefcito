begin;
alter table public.chef_recipes add column if not exists analysis jsonb;
create table if not exists public.chef_video_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','processing','done','error')),
 created_at timestamptz not null default now(), started_at timestamptz, result jsonb
);
create index if not exists chef_video_jobs_date on public.chef_video_jobs(created_at);
create index if not exists chef_video_jobs_user on public.chef_video_jobs(user_id);
alter table public.chef_video_jobs enable row level security;
revoke all on public.chef_video_jobs from anon,authenticated;
grant select on public.chef_video_jobs to authenticated;
drop policy if exists chef_video_jobs_read on public.chef_video_jobs;
create policy chef_video_jobs_read on public.chef_video_jobs for select to authenticated using (user_id=(select auth.uid()));
create or replace function public.chef_reserve_video() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); job uuid;
begin
 if uid is null then raise exception 'Ingresá a tu cuenta.'; end if;
 perform pg_advisory_xact_lock(723019);
 if (select count(*) from public.chef_video_jobs where user_id=uid and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=5 then raise exception 'Alcanzaste los 5 intentos diarios. Volvé mañana (se renueva a las 00:00 UTC).'; end if;
 if (select count(*) from public.chef_video_jobs where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=50 then raise exception 'Chefcito alcanzó su límite diario de análisis. Volvé mañana.'; end if;
 if exists(select 1 from public.chef_video_jobs where user_id=uid and created_at>now()-interval '6 minutes' and status in ('pending','processing')) then raise exception 'Ya tenés un análisis en curso. Esperá unos minutos.'; end if;
 insert into public.chef_video_jobs(user_id) values(uid) returning id into job; return job;
end $$;
create or replace function public.chef_claim_video(job_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return false; end if;
 perform pg_advisory_xact_lock(723019);
 if (select count(*) from public.chef_video_jobs where status='processing' and started_at>now()-interval '6 minutes')>=2 then raise exception 'Hay otros videos en análisis. Esperá un momento e intentá nuevamente.'; end if;
 update public.chef_video_jobs set status='processing',started_at=now() where id=job_id and user_id=auth.uid() and status='pending' and created_at>now()-interval '10 minutes';
 return found;
end $$;
create or replace function public.chef_finish_video(job_id uuid, job_result jsonb, succeeded boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if octet_length(job_result::text)>100000 then raise exception 'Resultado demasiado grande.'; end if;
 update public.chef_video_jobs set status=case when succeeded then 'done' else 'error' end,result=job_result where id=job_id and user_id=auth.uid() and status in ('pending','processing');
end $$;
revoke all on function public.chef_reserve_video() from public,anon;
revoke all on function public.chef_claim_video(uuid) from public,anon;
revoke all on function public.chef_finish_video(uuid,jsonb,boolean) from public,anon;
grant execute on function public.chef_reserve_video() to authenticated;
grant execute on function public.chef_claim_video(uuid) to authenticated;
grant execute on function public.chef_finish_video(uuid,jsonb,boolean) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('chef-videos','chef-videos',false,10485760,array['video/mp4','video/quicktime','video/webm'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['video/mp4','video/quicktime','video/webm'];
drop policy if exists chef_videos_read_delete on storage.objects;
create policy chef_videos_read_delete on storage.objects for select to authenticated using (bucket_id='chef-videos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists chef_videos_delete on storage.objects;
create policy chef_videos_delete on storage.objects for delete to authenticated using (bucket_id='chef-videos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists chef_videos_upload on storage.objects;
create policy chef_videos_upload on storage.objects for insert to authenticated with check (
 bucket_id='chef-videos' and (storage.foldername(name))[1]=auth.uid()::text and exists (
 select 1 from public.chef_video_jobs j where j.user_id=auth.uid() and j.status='pending' and j.created_at>now()-interval '10 minutes' and name=auth.uid()::text||'/'||j.id::text||'/video'
 ));
commit;
