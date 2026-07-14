CREATE POLICY "user_roles_insert_self_non_admin" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND role IN ('customer','merchant','courier'));

CREATE POLICY "user_roles_delete_own_non_admin" ON public.user_roles
FOR DELETE TO authenticated
USING (auth.uid() = user_id AND role IN ('customer','merchant','courier'));