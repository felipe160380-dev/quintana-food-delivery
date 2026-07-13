
CREATE POLICY "assets_read_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('store-assets','product-assets','avatars'));
CREATE POLICY "assets_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('store-assets','product-assets','avatars') AND owner = auth.uid());
CREATE POLICY "assets_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('store-assets','product-assets','avatars') AND owner = auth.uid());
CREATE POLICY "assets_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('store-assets','product-assets','avatars') AND owner = auth.uid());
