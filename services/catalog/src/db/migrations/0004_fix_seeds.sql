-- Clean up previous seeds to avoid duplicates or invalid mappings
DELETE FROM catalog.content_genres WHERE content_id IN (
  SELECT id FROM catalog.content WHERE tmdb_id IN (533535, 1022789, 693134, 872585, 157336, 155, 76600, 324857, 24428, 245891, 100088, 126308, 66732, 1396, 76479, 119051, 84958, 1399, 111110, 82856, 106379)
);

DELETE FROM catalog.episodes WHERE content_id IN (
  SELECT id FROM catalog.content WHERE tmdb_id IN (533535, 1022789, 693134, 872585, 157336, 155, 76600, 324857, 24428, 245891, 100088, 126308, 66732, 1396, 76479, 119051, 84958, 1399, 111110, 82856, 106379)
);

DELETE FROM catalog.seasons WHERE content_id IN (
  SELECT id FROM catalog.content WHERE tmdb_id IN (533535, 1022789, 693134, 872585, 157336, 155, 76600, 324857, 24428, 245891, 100088, 126308, 66732, 1396, 76479, 119051, 84958, 1399, 111110, 82856, 106379)
);

DELETE FROM catalog.content WHERE tmdb_id IN (533535, 1022789, 693134, 872585, 157336, 155, 76600, 324857, 24428, 245891, 100088, 126308, 66732, 1396, 76479, 119051, 84958, 1399, 111110, 82856, 106379);

-- Re-insert 10 Popular Movies with correct TMDB paths
INSERT INTO catalog.content (title, type, description, release_year, rating, imdb_score, duration_mins, plan_minimum, tmdb_id, imdb_id, s3_thumbnail, backdrop_url)
VALUES
  (
    'Deadpool & Wolverine', 'movie',
    'A listless Wade Wilson toils in civilian life with his days as the morally flexible mercenary, Deadpool, behind him. But when his homeworld faces an existential threat, Wade must reluctantly suit-up again with an even more reluctant Wolverine.',
    2024, 'R', 7.6, 128, 'basic', 533535, 'tt6263850',
    'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
    'https://image.tmdb.org/t/p/w1280/ufpeVEM64uZHPpzzeiDNIAdaeOD.jpg'
  ),
  (
    'Inside Out 2', 'movie',
    'Teenager Riley''s mind headquarters is undergoing a sudden demolition to make room for something entirely unexpected: new Emotions! Joy, Sadness, Anger, Fear and Disgust, who’ve long been running a successful operation by all accounts, aren’t sure how to feel when Anxiety shows up. And it looks like she’s not alone.',
    2024, 'PG', 7.5, 97, 'basic', 1022789, 'tt22022452',
    'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg',
    'https://image.tmdb.org/t/p/w1280/p5ozvmdgsmbWe0H8Xk7Rc8SCwAB.jpg'
  ),
  (
    'Dune: Part Two', 'movie',
    'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, Paul endeavors to prevent a terrible future only he can foresee.',
    2024, 'PG-13', 8.1, 167, 'basic', 693134, 'tt15239678',
    'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg'
  ),
  (
    'Oppenheimer', 'movie',
    'The story of J. Robert Oppenheimer''s role in the development of the atomic bomb during World War II.',
    2023, 'R', 8.0, 181, 'basic', 872585, 'tt15398776',
    'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    'https://image.tmdb.org/t/p/w1280/neeNHeXjMF5fXoCJRsOmkNGC7q.jpg'
  ),
  (
    'Interstellar', 'movie',
    'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
    2014, 'PG-13', 8.5, 169, 'basic', 157336, 'tt0816692',
    'https://image.tmdb.org/t/p/w500/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg',
    'https://image.tmdb.org/t/p/w1280/2ssWTSVklAEc98frZUQhgtGHx7s.jpg'
  ),
  (
    'The Dark Knight', 'movie',
    'Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets. The partnership proves to be effective, but they soon find themselves prey to a reign of chaos unleashed by a rising criminal mastermind known to the terrified citizens of Gotham as the Joker.',
    2008, 'PG-13', 8.5, 152, 'basic', 155, 'tt0468569',
    'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    'https://image.tmdb.org/t/p/w1280/cfT29Im5VDvjE0RpyKOSdCKZal7.jpg'
  ),
  (
    'Avatar: The Way of Water', 'movie',
    'Set more than a decade after the events of the first film, learn the story of the Sully family (Jake, Neytiri, and their kids), the trouble that follows them, the lengths they go to keep each other safe, the battles they fight to stay alive, and the tragedies they endure.',
    2022, 'PG-13', 7.6, 192, 'basic', 76600, 'tt1630029',
    'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    'https://image.tmdb.org/t/p/w1280/kJsPVzdyBrYHLomuNv5SJDXUQ2f.jpg'
  ),
  (
    'Spider-Man: Into the Spider-Verse', 'movie',
    'Struggling to find his place in the world while juggling school and family, Brooklyn teenager Miles Morales is unexpectedly bitten by a radioactive spider and develops unfathomable powers just like the one and only Spider-Man. While wrestling with the implications of his new abilities, Miles discovers a super collider created by the madman Wilson \"Kingpin\" Fisk, causing others from across the Spider-Verse to be inadvertently transported to his dimension.',
    2018, 'PG', 8.4, 117, 'basic', 324857, 'tt4633694',
    'https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg',
    'https://image.tmdb.org/t/p/w1280/8mnXR9rey5uQ08rZAvzojKWbDQS.jpg'
  ),
  (
    'The Avengers', 'movie',
    'When an unexpected enemy emerges and threatens global safety and security, Nick Fury, director of the international peacekeeping agency known as S.H.I.E.L.D., finds himself in need of a team to pull the world back from the brink of disaster. Spanning the globe, a daring recruitment effort begins!',
    2012, 'PG-13', 8.0, 143, 'basic', 24428, 'tt0848228',
    'https://image.tmdb.org/t/p/w500/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg',
    'https://image.tmdb.org/t/p/w1280/9BBTo63ANSmhC4e6r62OJFuK2GL.jpg'
  ),
  (
    'John Wick', 'movie',
    'Ex-hitman John Wick comes out of retirement to track down the gangsters that took everything from him.',
    2014, 'R', 7.5, 101, 'basic', 245891, 'tt2911666',
    'https://image.tmdb.org/t/p/w500/wXqWR7dHncNRbxoEGybEy7QTe9h.jpg',
    'https://image.tmdb.org/t/p/w1280/ff2ti5DkA9UYLzyqhQfI2kZqEuh.jpg'
  );

-- Re-insert 10 Popular TV Shows (Series) with correct TMDB paths and IDs
INSERT INTO catalog.content (title, type, description, release_year, rating, imdb_score, duration_mins, plan_minimum, tmdb_id, imdb_id, s3_thumbnail, backdrop_url)
VALUES
  (
    'The Last of Us', 'series',
    'Twenty years after modern civilization has been destroyed, Joel, a hardened survivor, is hired to smuggle Ellie, a 14-year-old girl, out of an oppressive quarantine zone. What starts as a small job soon becomes a brutal, heartbreaking journey, as they both must traverse the United States and depend on each other for survival.',
    2023, 'TV-MA', 8.4, NULL, 'basic', 100088, 'tt3581920',
    'https://image.tmdb.org/t/p/w500/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg',
    'https://image.tmdb.org/t/p/w1280/acevLdSl5I2MK5RYAm7gwAndt1w.jpg'
  ),
  (
    'Fallout', 'series',
    'The story of haves and have-nots in a world in which there’s almost nothing left to have. 200 years after the apocalypse, the gentle denizens of luxury fallout shelters are forced to return to the irradiated hellscape their ancestors left behind — and are shocked to discover an incredibly complex, gleefully weird, and highly violent universe waiting for them.',
    2024, 'TV-MA', 8.1, NULL, 'basic', 106379, 'tt12653330',
    'https://image.tmdb.org/t/p/w500/c15BtJxCXMrISLVmysdsnZUPQft.jpg',
    'https://image.tmdb.org/t/p/w1280/cIgHBLTMbcIkS0yvIrUUVVKLdOz.jpg'
  ),
  (
    'Shōgun', 'series',
    'In Japan in the year 1600, at the dawn of a century-defining civil war, Lord Yoshii Toranaga is fighting for his life as his enemies on the Council of Regents unite against him, when a mysterious European ship is found marooned in a nearby fishing village.',
    2024, 'TV-MA', 8.4, NULL, 'basic', 126308, 'tt2788316',
    'https://image.tmdb.org/t/p/w500/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg',
    'https://image.tmdb.org/t/p/w1280/6Tb87q9Tog30F5AAHh1gyDT2Vve.jpg'
  ),
  (
    'Stranger Things', 'series',
    'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces, and one strange little girl.',
    2016, 'TV-14', 8.6, NULL, 'basic', 66732, 'tt4574334',
    'https://image.tmdb.org/t/p/w500/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg',
    'https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg'
  ),
  (
    'Breaking Bad', 'series',
    'Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer and given a prognosis of only two years left to live. He becomes filled with a sense of fearlessness and an unrelenting desire to secure his family''s financial future at any cost as he enters the dangerous world of drugs and crime.',
    2008, 'TV-MA', 8.9, NULL, 'basic', 1396, 'tt0903747',
    'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
    'https://image.tmdb.org/t/p/w1280/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg'
  ),
  (
    'The Boys', 'series',
    'A group of vigilantes known informally as “The Boys” set out to take down corrupt superheroes with no more than blue-collar grit and a willingness to fight dirty.',
    2019, 'TV-MA', 8.5, NULL, 'basic', 76479, 'tt1190634',
    'https://image.tmdb.org/t/p/w500/in1R2dDc421JxsoRWaIIAqVI2KE.jpg',
    'https://image.tmdb.org/t/p/w1280/bq28ajZaoMyzEIm6REelqyqtEDZ.jpg'
  ),
  (
    'Wednesday', 'series',
    'Smart, sarcastic and a little dead inside, Wednesday Addams investigates twisted mysteries while making new friends — and foes — at Nevermore Academy.',
    2022, 'TV-14', 8.3, NULL, 'basic', 119051, 'tt13443470',
    'https://image.tmdb.org/t/p/w500/36xXlhEpQqVVPuiZhfoQuaY4OlA.jpg',
    'https://image.tmdb.org/t/p/w1280/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg'
  ),
  (
    'Loki', 'series',
    'After stealing the Tesseract during the events of “Avengers: Endgame,” an alternate version of Loki is brought to the mysterious Time Variance Authority, a bureaucratic organization that exists outside of time and space and monitors the timeline. They give Loki a choice: face being erased from existence due to being a “time variant” or help fix the timeline and stop a greater threat.',
    2021, 'TV-14', 8.2, NULL, 'basic', 84958, 'tt9140554',
    'https://image.tmdb.org/t/p/w500/kEl2t3OhXc3Zb9FBh1AuYzRTgZp.jpg',
    'https://image.tmdb.org/t/p/w1280/q3jHCb4dMfYF6ojikKuHd6LscxC.jpg'
  ),
  (
    'Game of Thrones', 'series',
    'Seven noble families fight for control of the mythical land of Westeros. Friction between the houses leads to full-scale war. All while a very ancient evil awakens in the farthest north. Amidst the war, a neglected military order of misfits, the Night''s Watch, is all that stands between the realms of men and icy horrors beyond.',
    2011, 'TV-MA', 8.5, NULL, 'basic', 1399, 'tt0944947',
    'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
    'https://image.tmdb.org/t/p/w1280/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg'
  ),
  (
    'The Mandalorian', 'series',
    'After the fall of the Galactic Empire, lawlessness has spread throughout the galaxy. A lone gunfighter makes his way through the outer reaches, earning his keep as a bounty hunter.',
    2019, 'TV-PG', 8.4, NULL, 'basic', 82856, 'tt8111088',
    'https://image.tmdb.org/t/p/w500/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg',
    'https://image.tmdb.org/t/p/w1280/9zcbqSxdsRMZWHYtyCd1nXPr2xq.jpg'
  );

-- Seed content-genre links for the new movies/series
INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 533535 AND g.slug IN ('action', 'comedy', 'sci-fi')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 1022789 AND g.slug IN ('animation', 'comedy', 'adventure')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 693134 AND g.slug IN ('sci-fi', 'adventure', 'action')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 872585 AND g.slug IN ('drama')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 157336 AND g.slug IN ('sci-fi', 'drama', 'adventure')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 155 AND g.slug IN ('action', 'crime', 'drama', 'thriller')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 76600 AND g.slug IN ('sci-fi', 'action', 'adventure')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 324857 AND g.slug IN ('animation', 'action', 'sci-fi')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 24428 AND g.slug IN ('action', 'sci-fi', 'adventure')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 245891 AND g.slug IN ('action', 'thriller', 'crime')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 100088 AND g.slug IN ('drama', 'action', 'sci-fi')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 106379 AND g.slug IN ('sci-fi', 'action', 'comedy')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 126308 AND g.slug IN ('drama', 'action')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 66732 AND g.slug IN ('sci-fi', 'mystery', 'drama')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 1396 AND g.slug IN ('drama', 'crime', 'thriller')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 76479 AND g.slug IN ('action', 'sci-fi', 'drama')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 119051 AND g.slug IN ('mystery', 'comedy', 'fantasy')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 84958 AND g.slug IN ('sci-fi', 'action', 'fantasy')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.content_genres (content_id, genre_id)
SELECT c.id, g.id FROM catalog.content c, catalog.genres g
WHERE c.tmdb_id = 1399 AND g.slug IN ('fantasy', 'drama', 'adventure')
ON CONFLICT DO NOTHING;

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
    SELECT id, title, tmdb_id FROM catalog.content WHERE type = 'series' AND tmdb_id IN (100088, 106379, 126308, 66732, 1396, 76479, 119051, 84958, 1399, 82856)
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
