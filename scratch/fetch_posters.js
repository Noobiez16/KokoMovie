import { writeFileSync } from 'fs';

const API_KEY = 'cdd7a8d55eff757a5ab29b7808641fd0';

const movieIds = [533535, 1022789, 693134, 872585, 157336, 155, 76600, 324857, 24428, 245891];
const tvIds = [100088, 126308, 66732, 1396, 76479, 119051, 84958, 1399, 111110, 82856];

async function run() {
  const movies = [];
  for (const id of movieIds) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${API_KEY}&append_to_response=external_ids`);
      const data = await res.json();
      movies.push({
        id: data.id,
        imdb_id: data.external_ids?.imdb_id || null,
        title: data.title,
        overview: data.overview,
        release_date: data.release_date,
        vote_average: data.vote_average,
        runtime: data.runtime,
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
      });
      console.log(`Fetched movie: ${data.title}`);
    } catch (err) {
      console.error(`Error movie ${id}:`, err);
    }
  }

  const tvs = [];
  for (const id of tvIds) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&append_to_response=external_ids`);
      const data = await res.json();
      tvs.push({
        id: data.id,
        imdb_id: data.external_ids?.imdb_id || null,
        title: data.name,
        overview: data.overview,
        first_air_date: data.first_air_date,
        vote_average: data.vote_average,
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
      });
      console.log(`Fetched TV: ${data.name}`);
    } catch (err) {
      console.error(`Error TV ${id}:`, err);
    }
  }

  writeFileSync('tmdb_data.json', JSON.stringify({ movies, tvs }, null, 2));
}

run();
