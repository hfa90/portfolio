drop policy if exists "safety reports admin update" on public.safety_reports;
create policy "safety reports admin update"
on public.safety_reports for update
to authenticated
using (((select auth.jwt()) ->> 'email') = 'admin@venus092.com.br')
with check (((select auth.jwt()) ->> 'email') = 'admin@venus092.com.br');

grant update on public.safety_reports to authenticated;

drop policy if exists "profile reviews admin select" on public.profile_reviews;
drop policy if exists "profile reviews public select" on public.profile_reviews;
create policy "profile reviews public select"
on public.profile_reviews for select
to anon, authenticated
using (status = 'published' or (((select auth.jwt()) ->> 'email') = 'admin@venus092.com.br'));

drop policy if exists "profile reviews admin update" on public.profile_reviews;
create policy "profile reviews admin update"
on public.profile_reviews for update
to authenticated
using (((select auth.jwt()) ->> 'email') = 'admin@venus092.com.br')
with check (((select auth.jwt()) ->> 'email') = 'admin@venus092.com.br');

grant update on public.profile_reviews to authenticated;
