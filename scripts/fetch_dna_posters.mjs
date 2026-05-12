// One-off helper: prints TMDb id + poster_path for each movie used in
// stream·score DNA movie-pair questions. Run manually; output is pasted
// (by hand or copy/paste) into data/dna/questions.json. Not used at runtime.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvLocal() {
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const txt = readFileSync(resolve(here, "..", ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}
loadEnvLocal();

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error("TMDB_API_KEY missing. Run: TMDB_API_KEY=... node scripts/fetch_dna_posters.mjs");
  process.exit(1);
}

const movies = [
  ["q1.a", "The Grand Budapest Hotel", 2014],
  ["q1.b", "Mad Max: Fury Road", 2015],
  ["q4.a", "Parasite", 2019],
  ["q4.b", "Knives Out", 2019],
  ["q7.a", "Everything Everywhere All at Once", 2022],
  ["q7.b", "Aftersun", 2022],
  ["q8.a", "One Battle After Another", 2025],
  ["q8.b", "Wicked: For Good", 2025],
  ["q10.a", "Past Lives", 2023],
  ["q10.b", "Challengers", 2024],
  ["q13.a", "Sicario", 2015],
  ["q13.b", "No Country for Old Men", 2007],
  ["q15.a", "Lost in Translation", 2003],
  ["q15.b", "The Wolf of Wall Street", 2013],
  ["q17.a", "Sinners", 2025],
  ["q17.b", "F1", 2025],
];

for (const [tag, title, year] of movies) {
  const u = new URL("https://api.themoviedb.org/3/search/movie");
  u.searchParams.set("query", title);
  u.searchParams.set("year", String(year));
  u.searchParams.set("api_key", KEY);
  const r = await fetch(u);
  const d = await r.json();
  const top = (d.results || [])[0];
  if (!top) { console.log(tag, "NONE"); continue; }
  console.log(`${tag}\t${top.id}\t${JSON.stringify(top.title)}\t${top.release_date}\thttps://image.tmdb.org/t/p/w500${top.poster_path}`);
}
