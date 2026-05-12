// EvidenceRow — "Films in your DNA" — three signature movie posters per
// archetype. Server component: fetches TMDb on render and caches via Next's
// fetch revalidate (24h). If a poster fails to load we fall back to a
// gradient placeholder with the title.

import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdbClient";

export interface ArchetypeWithSignatures {
  key: string;
  name: string;
  anchorFilm: { tmdbId: number; title: string };
  signatureFilms?: number[];
}

interface FilmCard {
  id: number;
  title: string;
  poster: string | null;
}

async function fetchPoster(id: number): Promise<FilmCard | null> {
  const key = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${id}?api_key=${key}`,
      { next: { revalidate: 60 * 60 * 24 } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; poster_path?: string | null };
    return {
      id,
      title: j.title ?? `Film ${id}`,
      poster: j.poster_path ?? null,
    };
  } catch {
    return null;
  }
}

function titleGradient(title: string): string {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  const baseH = 20 + (h % 30);
  const altH = baseH + 25;
  return `linear-gradient(135deg, oklch(0.30 0.07 ${baseH}), oklch(0.16 0.04 ${altH}))`;
}

export async function EvidenceRow({ archetype }: { archetype: ArchetypeWithSignatures }) {
  const ids = (archetype.signatureFilms ?? []).slice(0, 3);
  if (ids.length === 0) return null;

  const settled = await Promise.all(ids.map(fetchPoster));
  const films = settled.filter((f): f is FilmCard => f !== null);
  if (films.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Films in your DNA">
      <div
        className="num-prose text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)]"
        style={{ letterSpacing: "0.22em" }}
      >
        Films in your DNA
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {films.map((f) => {
          const poster = posterUrl(f.poster, "w500");
          return (
            <Link
              key={f.id}
              href={`/movie/${f.id}`}
              className="group block"
              aria-label={`${f.title}`}
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_12px_30px_-20px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:-translate-y-1">
                {poster ? (
                  <Image
                    src={poster}
                    alt={`${f.title} poster`}
                    fill
                    sizes="(max-width: 640px) 30vw, 200px"
                    className="object-cover"
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center px-3 text-center"
                    style={{ backgroundImage: titleGradient(f.title) }}
                  >
                    <span className="font-display line-clamp-4 text-base leading-tight text-[var(--color-text)]/85">
                      {f.title}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-2 line-clamp-1 text-[12px] text-[var(--color-muted)] group-hover:text-[var(--color-text)]">
                {f.title}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
