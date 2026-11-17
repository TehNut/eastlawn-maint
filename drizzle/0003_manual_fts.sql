-- Turso's full-text index (tantivy), kept up to date by the engine itself. manual_id is indexed
-- too, so a search can be narrowed to one manual inside the index. Needs the index_method
-- experimental flag, set where the database is opened.
CREATE INDEX `manual_chunk_fts` ON `manual_chunk` USING fts (`manual_id`, `text`);
