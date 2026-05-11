import { DiscoverClient } from "./_DiscoverClient";
import { getMovieGenres } from "@/lib/tmdbClient";
import type { TmdbGenre } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let genres: TmdbGenre[] = [];
  let configError: string | null = null;
  try {
    genres = await getMovieGenres();
  } catch (e) {
    configError = e instanceof Error ? e.message : "Failed to load genres.";
  }

  return <DiscoverClient initialGenres={genres} configError={configError} />;
}
