import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Star } from "lucide-react";
import { getMovieDetail } from "@/lib/tmdbClient";
import { buildMovieResultFromDetail } from "@/lib/buildMovieResult";
import { RatingDial } from "@/components/RatingDial";
import { MovieDetailClient } from "./_MovieDetailClient";
import { AmbientBackdrop } from "./_AmbientBackdrop";

export const dynamic = "force-dynamic";

export default async function MoviePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const movieId = Number(id);
  if (!Number.isFinite(movieId)) notFound();

  let detail;
  try {
    detail = await getMovieDetail(movieId);
  } catch (e) {
    return (
      <div className="rounded-2xl border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/10 p-5 text-sm">
        <div className="font-semibold">Failed to load this movie</div>
        <div className="mt-1 text-[var(--color-muted)]">
          {e instanceof Error ? e.message : "Unknown error"}
        </div>
        <Link href="/" className="mt-3 inline-block underline-offset-4 hover:underline">
          ← Back to discovery
        </Link>
      </div>
    );
  }

  const result = await buildMovieResultFromDetail(detail, {
    region: (process.env.NEXT_PUBLIC_TMDB_REGION || "US").toUpperCase(),
    selectedProviderKeys: [],
  });

  const r = result.ratings;

  return (
    <article className="relative -mt-4 space-y-8 sm:-mt-6">
      <AmbientBackdrop posterUrl={result.posterUrl} backdropUrl={result.backdropUrl} />

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-x-0 -top-4 -z-10 h-[60vh] overflow-hidden sm:-top-6 sm:h-[55vh]">
          {result.backdropUrl ? (
            <>
              <Image
                src={result.backdropUrl}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--color-bg)]/40 to-[var(--color-bg)]" />
            </>
          ) : null}
        </div>

        <div className="pt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)]/70 px-3 py-1.5 text-xs text-[var(--color-muted)] backdrop-blur hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Discover
          </Link>
        </div>

        <div className="mt-6 grid gap-6 sm:mt-12 sm:grid-cols-[14rem_1fr]">
          <div className="mx-auto w-40 sm:mx-0 sm:w-56">
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
              {result.posterUrl ? (
                <Image
                  src={result.posterUrl}
                  alt={result.title}
                  width={500}
                  height={750}
                  className="h-auto w-full"
                />
              ) : (
                <div className="aspect-[2/3] w-full" />
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h1 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">
                {result.title}
              </h1>
              {detail.tagline && (
                <p className="mt-2 italic text-[var(--color-muted)]">
                  &ldquo;{detail.tagline}&rdquo;
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
              {result.year && <span className="tabular-nums">{result.year}</span>}
              {result.runtime && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="tabular-nums">{result.runtime} min</span>
                </>
              )}
              {result.originalLanguage && (
                <>
                  <span className="opacity-40">·</span>
                  <span>{result.originalLanguage.toUpperCase()}</span>
                </>
              )}
              {detail.director && (
                <>
                  <span className="opacity-40">·</span>
                  <span>
                    Dir. <span className="text-[var(--color-text)]">{detail.director}</span>
                  </span>
                </>
              )}
            </div>

            {result.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1 text-xs"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Rating dials */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-3">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full font-mono text-lg font-bold tabular-nums"
                  style={{
                    background:
                      r.combined == null
                        ? "var(--color-surface-2)"
                        : r.combined >= 80
                          ? "var(--color-good)"
                          : r.combined >= 65
                            ? "var(--color-warn)"
                            : r.combined >= 45
                              ? "var(--color-accent)"
                              : "var(--color-bad)",
                    color: "oklch(0.18 0.01 270)",
                  }}
                >
                  {r.combined == null ? "—" : Math.round(r.combined)}
                </div>
                <div className="leading-tight">
                  <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
                    Combined
                  </div>
                  <div className="text-[10px] text-[var(--color-subtle)]">
                    {r.available.length || 0} sources
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RatingDial
                  label="IMDb"
                  value={r.imdb != null ? r.imdb / 10 : null}
                  max={10}
                  size={56}
                />
                <RatingDial label="RT" value={r.rottenTomatoes} size={56} />
                <RatingDial label="Meta" value={r.metacritic} size={56} />
                <RatingDial label="Audience" value={r.audience} size={56} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Overview */}
      <section className="space-y-3 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
        <p className="text-[15px] leading-relaxed text-[var(--color-text)]/90">
          {result.overview || "No overview available."}
        </p>
        {detail.cast.length > 0 && (
          <div className="pt-2">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Cast
            </div>
            <div className="flex flex-wrap gap-1.5">
              {detail.cast.slice(0, 8).map((c) => (
                <span
                  key={c.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-1 text-[var(--color-muted)]">as {c.character}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <MovieDetailClient initialResult={result} />

      <section className="flex flex-wrap gap-2 text-sm">
        <ExternalChip href={result.links.tmdb}>TMDb</ExternalChip>
        {result.links.imdb && <ExternalChip href={result.links.imdb}>IMDb</ExternalChip>}
        {result.links.justwatch && (
          <ExternalChip href={result.links.justwatch}>JustWatch</ExternalChip>
        )}
        {result.imdbId && (
          <ExternalChip href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(result.title)}`}>
            <Star className="mr-1 inline h-3 w-3" /> Rotten Tomatoes
          </ExternalChip>
        )}
      </section>
    </article>
  );
}

function ExternalChip({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1.5 hover:border-[var(--color-border-strong)]"
    >
      {children} <ExternalLink className="h-3 w-3 opacity-70" />
    </a>
  );
}
