-- Evaluate auth.uid() once per statement instead of once per profile row.
alter policy "Users can view own profile"
  on public.profiles
  using ((select auth.uid()) = id);

alter policy "Users can insert own profile"
  on public.profiles
  with check ((select auth.uid()) = id);

alter policy "Users can update own profile"
  on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
