CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE IF NOT EXISTS catalog.content (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  description      TEXT,
  release_year     SMALLINT,
  rating           TEXT CHECK (rating IN ('G', 'PG', 'PG-13', 'R', 'TV-MA', 'TV-14', 'TV-PG', 'TV-G', 'NR')),
  imdb_score       NUMERIC(3,1),
  duration_mins    SMALLINT,
  s3_thumbnail     TEXT,
  s3_trailer_key   TEXT,
  drm_key_id       UUID,
  plan_minimum     TEXT NOT NULL DEFAULT 'basic',
  intro_start_secs INTEGER,
  intro_end_secs   INTEGER,
  credits_start_secs INTEGER,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog.genres (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS catalog.content_genres (
  content_id UUID NOT NULL REFERENCES catalog.content(id) ON DELETE CASCADE,
  genre_id   UUID NOT NULL REFERENCES catalog.genres(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, genre_id)
);

CREATE TABLE IF NOT EXISTS catalog.cast_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  photo_url TEXT,
  bio       TEXT
);

CREATE TABLE IF NOT EXISTS catalog.content_cast (
  content_id     UUID NOT NULL REFERENCES catalog.content(id) ON DELETE CASCADE,
  cast_member_id UUID NOT NULL REFERENCES catalog.cast_members(id) ON DELETE CASCADE,
  role           TEXT,
  "order"        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (content_id, cast_member_id)
);

CREATE TABLE IF NOT EXISTS catalog.seasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id    UUID NOT NULL REFERENCES catalog.content(id) ON DELETE CASCADE,
  season_number SMALLINT NOT NULL,
  title         TEXT,
  overview      TEXT,
  air_date      TEXT,
  UNIQUE (content_id, season_number)
);

CREATE TABLE IF NOT EXISTS catalog.episodes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      UUID NOT NULL REFERENCES catalog.seasons(id) ON DELETE CASCADE,
  content_id     UUID NOT NULL REFERENCES catalog.content(id) ON DELETE CASCADE,
  episode_number SMALLINT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  duration_mins  SMALLINT,
  s3_hls_key     TEXT,
  s3_thumbnail_key TEXT,
  intro_start_secs INTEGER,
  intro_end_secs   INTEGER,
  credits_start_secs INTEGER,
  air_date       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, episode_number)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_content_type ON catalog.content(type);
CREATE INDEX IF NOT EXISTS idx_content_release_year ON catalog.content(release_year);
CREATE INDEX IF NOT EXISTS idx_content_is_active ON catalog.content(is_active);
CREATE INDEX IF NOT EXISTS idx_content_genres_genre_id ON catalog.content_genres(genre_id);
CREATE INDEX IF NOT EXISTS idx_episodes_content_id ON catalog.episodes(content_id);
CREATE INDEX IF NOT EXISTS idx_seasons_content_id ON catalog.seasons(content_id);

-- Seed genres
INSERT INTO catalog.genres (name, slug) VALUES
  ('Action', 'action'),
  ('Adventure', 'adventure'),
  ('Animation', 'animation'),
  ('Comedy', 'comedy'),
  ('Crime', 'crime'),
  ('Documentary', 'documentary'),
  ('Drama', 'drama'),
  ('Fantasy', 'fantasy'),
  ('Horror', 'horror'),
  ('Mystery', 'mystery'),
  ('Romance', 'romance'),
  ('Sci-Fi', 'sci-fi'),
  ('Thriller', 'thriller'),
  ('Western', 'western'),
  ('Kids', 'kids')
ON CONFLICT (slug) DO NOTHING;

-- Seed sample content for development
INSERT INTO catalog.content (title, type, description, release_year, rating, imdb_score, duration_mins, plan_minimum)
VALUES
  ('Galactic Odyssey', 'movie', 'A crew of astronauts ventures beyond the known universe to find humanity a new home.', 2024, 'PG-13', 8.2, 142, 'basic'),
  ('The Last Detective', 'series', 'A seasoned detective navigates a corrupt city while unraveling a decades-old conspiracy.', 2023, 'TV-MA', 8.7, NULL, 'standard'),
  ('Iron Kingdom', 'series', 'In a medieval world where magic is forbidden, a blacksmith discovers an ancient power.', 2024, 'TV-14', 7.9, NULL, 'basic'),
  ('Midnight Protocol', 'movie', 'When a rogue AI takes control of a smart city, one hacker must shut it down before dawn.', 2025, 'R', 7.4, 118, 'basic'),
  ('Neon Frontier', 'series', 'Cyberpunk detectives hunt a serial killer across a neon-soaked megacity in 2087.', 2025, 'TV-MA', 8.5, NULL, 'premium_4k')
ON CONFLICT DO NOTHING;

-- Seed dev thumbnails — cinematic Unsplash images themed to each title
UPDATE catalog.content SET s3_thumbnail = 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=300&h=450&fit=crop&q=80' WHERE title = 'Galactic Odyssey';
UPDATE catalog.content SET s3_thumbnail = 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=300&h=450&fit=crop&q=80' WHERE title = 'The Last Detective';
UPDATE catalog.content SET s3_thumbnail = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=450&fit=crop&q=80' WHERE title = 'Iron Kingdom';
UPDATE catalog.content SET s3_thumbnail = 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=300&h=450&fit=crop&q=80' WHERE title = 'Midnight Protocol';
UPDATE catalog.content SET s3_thumbnail = 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=300&h=450&fit=crop&q=80' WHERE title = 'Neon Frontier';

-- Seed content-genre links
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.title = 'Galactic Odyssey' AND g.slug IN ('sci-fi', 'adventure', 'action')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.title = 'The Last Detective' AND g.slug IN ('crime', 'mystery', 'drama', 'thriller')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.title = 'Iron Kingdom' AND g.slug IN ('fantasy', 'drama', 'adventure')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.title = 'Midnight Protocol' AND g.slug IN ('sci-fi', 'thriller', 'action')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.title = 'Neon Frontier' AND g.slug IN ('crime', 'sci-fi', 'thriller')
ON CONFLICT DO NOTHING;
