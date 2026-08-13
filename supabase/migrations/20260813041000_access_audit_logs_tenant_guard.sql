-- Keep client audit writes tenant-scoped and attributable to the caller.
-- Browser callers already pass the resolved owner_user_id; service-role
-- server-side audit writes bypass RLS and keep their existing contract.

alter policy access_audit_logs_insert
  on public.access_audit_logs
  with check (
    operator_user_id = auth.uid()
    and owner_user_id = get_owner_user_id(auth.uid())
  );
