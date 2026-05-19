-- Seed 10 Popular Movies
INSERT INTO catalog.content (title, type, description, release_year, rating, imdb_score, duration_mins, plan_minimum, tmdb_id, imdb_id, s3_thumbnail, backdrop_url)
VALUES
  (
    'Deadpool & Wolverine', 'movie',
    'A listless Wade Wilson toils in civilian life. His days as the morally flexible mercenary, Deadpool, behind him. When his homeworld faces an existential threat, Wade must reluctantly suit-up again with an even more reluctant... Wolverine.',
    2024, 'R', 7.7, 128, 'basic', 533535, 'tt6263850',
    'https://image.tmdb.org/t/p/w500/8cdcl36ExOi1q1OmNIu56zRrHlh.jpg',
    'https://image.tmdb.org/t/p/w1280/yD1KsR4BhqR4rn46865peGdXUmI.jpg'
  ),
  (
    'Inside Out 2', 'movie',
    'Teenager Riley''s mind headquarters is undergoing a sudden demolition to make room for something entirely unexpected: new Emotions! Joy, Sadness, Anger, Fear and Disgust, who’ve long been running a successful operation by all accounts, aren’t sure how to feel when Anxiety shows up. And it looks like she’s not alone.',
    2024, 'PG', 7.6, 96, 'basic', 1022789, 'tt22022452',
    'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmFJgwfvJrmoo58YEy.jpg',
    'https://image.tmdb.org/t/p/w1280/stKG2Oy3t70o131F6A1L1Hd8fgC.jpg'
  ),
  (
    'Dune: Part Two', 'movie',
    'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.',
    2024, 'PG-13', 8.2, 166, 'basic', 693134, 'tt15239678',
    'https://image.tmdb.org/t/p/w500/czemb4hm1YOSR461r7nCjR25h2y.jpg',
    'https://image.tmdb.org/t/p/w1280/xOMo8j360w2UPWIBld14BM4L4c2.jpg'
  ),
  (
    'Oppenheimer', 'movie',
    'The story of J. Robert Oppenheimer''s role in the development of the atomic bomb during World War II.',
    2023, 'R', 8.1, 180, 'basic', 872585, 'tt15398776',
    'https://image.tmdb.org/t/p/w500/8Gxv2wSrqvNUYSuwygKIjACvW3F.jpg',
    'https://image.tmdb.org/t/p/w1280/m8JGC14848CYr49767nJ2eIP5fh.jpg'
  ),
  (
    'Interstellar', 'movie',
    'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
    2014, 'PG-13', 8.4, 169, 'basic', 157336, 'tt0816692',
    'https://image.tmdb.org/t/p/w500/gEU2QvEzv5fg7net3j34t47mgv0.jpg',
    'https://image.tmdb.org/t/p/w1280/xJHokZbljvjC1OHGwZgV6P5iR6P.jpg'
  ),
  (
    'The Dark Knight', 'movie',
    'Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets. The partnership proves to be effective, but they soon find themselves prey to a reign of chaos unleashed by a rising criminal mastermind known to the terrified citizens of Gotham as the Joker.',
    2008, 'PG-13', 8.5, 152, 'basic', 155, 'tt0468569',
    'https://image.tmdb.org/t/p/w500/qJ2tWGB2XoiRUEa67GjH6DUmSSp.jpg',
    'https://image.tmdb.org/t/p/w1280/o8eb05542cb7bfebcb2cd3ba.jpg'
  ),
  (
    'Avatar: The Way of Water', 'movie',
    'Set more than a decade after the events of the first film, learn the story of the Sully family (Jake, Neytiri, and their kids), the trouble that follows them, the lengths they go to keep each other safe, the battles they fight to stay alive, and the tragedies they endure.',
    2022, 'PG-13', 7.6, 192, 'basic', 76600, 'tt1630029',
    'https://image.tmdb.org/t/p/w500/t6z2IDmdlY2j2feGW76V9uU965m.jpg',
    'https://image.tmdb.org/t/p/w1280/ovM06Pd1NmUxvnZMI8sS4ih0mgB.jpg'
  ),
  (
    'Spider-Man: Into the Spider-Verse', 'movie',
    'Struggling to find his place in the world while juggling school and friends, Brooklyn teen Miles Morales is unexpectedly bitten by a radioactive spider and develops superpowers. When the infamous Kingpin unleashes a super-collider, it opens portals to other dimensions, bringing multiple alternate versions of Spider-Man to Miles'' world.',
    2018, 'PG', 8.4, 117, 'basic', 324857, 'tt4633694',
    'https://image.tmdb.org/t/p/w500/iiZZN643b6R1wBE2Z2sahtUqNlz.jpg',
    'https://image.tmdb.org/t/p/w1280/x2rc7pt0rrnJpqunn68rzkpt8uq.jpg'
  ),
  (
    'The Avengers', 'movie',
    'When an unexpected enemy emerges and threatens global safety and security, Nick Fury, director of the international peacekeeping agency known as S.H.I.E.L.D., finds himself in need of a team to pull the world back from the brink of disaster. Spanning the globe, a daring recruitment effort begins.',
    2012, 'PG-13', 7.7, 143, 'basic', 24428, 'tt0848228',
    'https://image.tmdb.org/t/p/w500/RYMX2wc76VQUv424IEAh545nK6.jpg',
    'https://image.tmdb.org/t/p/w1280/9BBGo66Wj6nE6tD8n74k7xCMziN.jpg'
  ),
  (
    'John Wick', 'movie',
    'Ex-hitman John Wick comes out of retirement to track down the gangsters that took everything from him.',
    2014, 'R', 7.4, 101, 'basic', 245891, 'tt2906216',
    'https://image.tmdb.org/t/p/w500/fz1w4j7akwS4f25OCMR7iIY93vO.jpg',
    'https://image.tmdb.org/t/p/w1280/d37149qY4wqGXD4AxHQTLZ6b.jpg'
  )
ON CONFLICT (tmdb_id) WHERE tmdb_id IS NOT NULL DO NOTHING;

-- Seed 10 Popular TV Shows (Series)
INSERT INTO catalog.content (title, type, description, release_year, rating, imdb_score, duration_mins, plan_minimum, tmdb_id, imdb_id, s3_thumbnail, backdrop_url)
VALUES
  (
    'The Last of Us', 'series',
    'Twenty years after modern civilization has been destroyed, Joel, a hardened survivor, is hired to smuggle Ellie, a 14-year-old girl, out of an oppressive quarantine zone. What starts as a small job soon becomes a brutal, heartbreaking journey, as they both must traverse the U.S. and depend on each other for survival.',
    2023, 'TV-MA', 8.6, NULL, 'basic', 100088, 'tt3581920',
    'https://image.tmdb.org/t/p/w500/uKVZ56Rbgj470m115ZzoYnEB42q.jpg',
    'https://image.tmdb.org/t/p/w1280/uDgy6hyPd82kOHh6I89egt6xZGB.jpg'
  ),
  (
    'Fallout', 'series',
    'The story of haves and have-nots in a world in which there’s almost nothing left to have. 200 years after the apocalypse, the gentle denizens of luxury fallout shelters are forced to return to the irradiated hellscape their ancestors left behind — and are shocked to discover an incredibly complex, gleefully weird, and highly violent universe waiting for them.',
    2024, 'TV-MA', 8.4, NULL, 'basic', 126308, 'tt12653330',
    'https://image.tmdb.org/t/p/w500/m59VP5W35G6nBcln1JczLS4g52K.jpg',
    'https://image.tmdb.org/t/p/w1280/bd2qlCgdtwQZ96Bcx7Q5lhg654.jpg'
  ),
  (
    'Stranger Things', 'series',
    'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    2016, 'TV-14', 8.6, NULL, 'basic', 66732, 'tt5016204',
    'https://image.tmdb.org/t/p/w500/49WJfeN0mhmm6ntrxoGbvR46ftQ.jpg',
    'https://image.tmdb.org/t/p/w1280/56v2gK2FRTLZ6bTApsn4X77x593.jpg'
  ),
  (
    'Breaking Bad', 'series',
    'Walter White, a New Mexico chemistry teacher, diagnosed with stage III cancer, turns to a life of crime, partnering with a former student, Jesse Pinkman, to produce and sell methamphetamine to secure his family''s financial future.',
    2008, 'TV-MA', 8.9, NULL, 'basic', 1396, 'tt0903747',
    'https://image.tmdb.org/t/p/w500/ztkUQVk5e9wES24oymHM8iEOWFa.jpg',
    'https://image.tmdb.org/t/p/w1280/tsRy63Mu0t86JUr7J95i4X4jIv.jpg'
  ),
  (
    'The Boys', 'series',
    'A group of vigilantes set out to take down corrupt superheroes who abuse their superpowers.',
    2019, 'TV-MA', 8.5, NULL, 'basic', 76479, 'tt1190634',
    'https://image.tmdb.org/t/p/w500/7NsMv2w7tVSg75T48t0m2uiJUVM.jpg',
    'https://image.tmdb.org/t/p/w1280/n6bUie04i1a77lrAhcY6wki865k.jpg'
  ),
  (
    'Wednesday', 'series',
    'Wednesday Addams'' misadventures as a student at Nevermore Academy, a very unique boarding school.',
    2022, 'TV-14', 8.0, NULL, 'basic', 119051, 'tt13443470',
    'https://image.tmdb.org/t/p/w500/jeGvK2LLQjG1NM5ZOoBguA5LIb5.jpg',
    'https://image.tmdb.org/t/p/w1280/iH7395Gxi9Xh4suwguA5LIb5.jpg'
  ),
  (
    'Loki', 'series',
    'After stealing the Tesseract during the events of Avengers: Endgame, Loki is brought to the mysterious Time Variance Authority (TVA), a bureaucratic organization that exists outside of time and space and monitors the timeline.',
    2021, 'TV-14', 8.2, NULL, 'basic', 84958, 'tt9140554',
    'https://image.tmdb.org/t/p/w500/voHU16VmTMvH6jFG5o6Y46J2t4J.jpg',
    'https://image.tmdb.org/t/p/w1280/q3j4244jgfgJfg74JVoHU16VmTMv.jpg'
  ),
  (
    'Game of Thrones', 'series',
    'Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns after being dormant for thousands of years.',
    2011, 'TV-MA', 8.4, NULL, 'basic', 1399, 'tt0944947',
    'https://image.tmdb.org/t/p/w500/1XS5jU3Z7WS5I4yR9qS3t6iypGI.jpg',
    'https://image.tmdb.org/t/p/w1280/2OMB0ph21aNDNDNDt6iypGId3t.jpg'
  ),
  (
    'Shōgun', 'series',
    'Set in Japan in the year 1600, Lord Yoshii Toranaga is fighting for his life as his enemies on the Council of Regents unite against him, when a mysterious European ship is found marooned in a nearby fishing village.',
    2024, 'TV-MA', 8.7, NULL, 'basic', 111110, 'tt27988358',
    'https://image.tmdb.org/t/p/w500/7O4iV6mqPH8q37BhS74k7xCMziN.jpg',
    'https://image.tmdb.org/t/p/w1280/5zMwY8pY8q37BhS74k7xCMziN.jpg'
  ),
  (
    'The Mandalorian', 'series',
    'The travels of a lone bounty hunter in the outer reaches of the galaxy, far from the authority of the New Republic.',
    2019, 'TV-PG', 8.4, NULL, 'basic', 82856, 'tt8111088',
    'https://image.tmdb.org/t/p/w500/e31adKrr9qY4wqGXD4AxHQTLZ6b.jpg',
    'https://image.tmdb.org/t/p/w1280/a95y8qY4wqGXD4AxHQTLZ6b.jpg'
  )
ON CONFLICT (tmdb_id) WHERE tmdb_id IS NOT NULL DO NOTHING;

-- Seed content-genre links for the new movies/series
-- Deadpool & Wolverine (Action, Comedy, Sci-Fi)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 533535 AND g.slug IN ('action', 'comedy', 'sci-fi')
ON CONFLICT DO NOTHING;

-- Inside Out 2 (Animation, Comedy, Adventure)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 1022789 AND g.slug IN ('animation', 'comedy', 'adventure')
ON CONFLICT DO NOTHING;

-- Dune: Part Two (Sci-Fi, Adventure, Action)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 693134 AND g.slug IN ('sci-fi', 'adventure', 'action')
ON CONFLICT DO NOTHING;

-- Oppenheimer (Drama)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 872585 AND g.slug IN ('drama')
ON CONFLICT DO NOTHING;

-- Interstellar (Sci-Fi, Drama, Adventure)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 157336 AND g.slug IN ('sci-fi', 'drama', 'adventure')
ON CONFLICT DO NOTHING;

-- The Dark Knight (Action, Crime, Drama, Thriller)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 155 AND g.slug IN ('action', 'crime', 'drama', 'thriller')
ON CONFLICT DO NOTHING;

-- Avatar: The Way of Water (Sci-Fi, Action, Adventure)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 76600 AND g.slug IN ('sci-fi', 'action', 'adventure')
ON CONFLICT DO NOTHING;

-- Spider-Man: Into the Spider-Verse (Animation, Action, Sci-Fi)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 324857 AND g.slug IN ('animation', 'action', 'sci-fi')
ON CONFLICT DO NOTHING;

-- The Avengers (Action, Sci-Fi, Adventure)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 24428 AND g.slug IN ('action', 'sci-fi', 'adventure')
ON CONFLICT DO NOTHING;

-- John Wick (Action, Thriller, Crime)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 245891 AND g.slug IN ('action', 'thriller', 'crime')
ON CONFLICT DO NOTHING;

-- The Last of Us (Drama, Action, Sci-Fi)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 100088 AND g.slug IN ('drama', 'action', 'sci-fi')
ON CONFLICT DO NOTHING;

-- Fallout (Sci-Fi, Action, Comedy)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 126308 AND g.slug IN ('sci-fi', 'action', 'comedy')
ON CONFLICT DO NOTHING;

-- Stranger Things (Sci-Fi, Mystery, Drama)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 66732 AND g.slug IN ('sci-fi', 'mystery', 'drama')
ON CONFLICT DO NOTHING;

-- Breaking Bad (Drama, Crime, Thriller)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 1396 AND g.slug IN ('drama', 'crime', 'thriller')
ON CONFLICT DO NOTHING;

-- The Boys (Action, Sci-Fi, Drama)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 76479 AND g.slug IN ('action', 'sci-fi', 'drama')
ON CONFLICT DO NOTHING;

-- Wednesday (Mystery, Comedy, Fantasy)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 119051 AND g.slug IN ('mystery', 'comedy', 'fantasy')
ON CONFLICT DO NOTHING;

-- Loki (Sci-Fi, Action, Fantasy)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 84958 AND g.slug IN ('sci-fi', 'action', 'fantasy')
ON CONFLICT DO NOTHING;

-- Game of Thrones (Fantasy, Drama, Adventure)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 1399 AND g.slug IN ('fantasy', 'drama', 'adventure')
ON CONFLICT DO NOTHING;

-- Shōgun (Drama, Action)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 111110 AND g.slug IN ('drama', 'action')
ON CONFLICT DO NOTHING;

-- The Mandalorian (Sci-Fi, Action, Adventure)
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 82856 AND g.slug IN ('sci-fi', 'action', 'adventure')
ON CONFLICT DO NOTHING;


-- Seed seasons and episodes for TV Shows so they can be played offline/automatically
DO $$
DECLARE
  tv_rec RECORD;
  season_id_val UUID;
BEGIN
  FOR tv_rec IN
    SELECT id, title, tmdb_id FROM catalog.content WHERE type = 'series' AND tmdb_id IN (100088, 126308, 66732, 1396, 76479, 119051, 84958, 1399, 111110, 82856)
  LOOP
    -- Insert Season 1
    INSERT INTO catalog.seasons (content_id, season_number, title, overview)
    VALUES (tv_rec.id, 1, 'Season 1', 'The premier season of ' || tv_rec.title)
    ON CONFLICT (content_id, season_number) DO UPDATE
    SET title = EXCLUDED.title
    RETURNING id INTO season_id_val;

    -- Insert 3 episodes for Season 1
    INSERT INTO catalog.episodes (season_id, content_id, episode_number, title, description, duration_mins)
    VALUES
      (season_id_val, tv_rec.id, 1, 'Episode 1', 'The journey begins as characters face unexpected shifts in their environment.', 55),
      (season_id_val, tv_rec.id, 2, 'Episode 2', 'Tensions rise as paths cross and critical decisions must be made.', 50),
      (season_id_val, tv_rec.id, 3, 'Episode 3', 'Secrets are unveiled as the group prepares for the challenges ahead.', 58)
    ON CONFLICT (season_id, episode_number) DO NOTHING;
  END LOOP;
END $$;
