ALTER TABLE catalog.content ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;
ALTER TABLE catalog.content ADD COLUMN IF NOT EXISTS imdb_id TEXT;
ALTER TABLE catalog.content ADD COLUMN IF NOT EXISTS backdrop_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_tmdb_id ON catalog.content(tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_imdb_id ON catalog.content(imdb_id) WHERE imdb_id IS NOT NULL;
