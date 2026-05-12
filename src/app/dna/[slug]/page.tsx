// /dna/[slug] — the reveal page. Server component.
//
// Editorial layout:
//   1. Eyebrow "Your stream·score DNA"
//   2. Hero — archetype name in Instrument Serif, italic accent on the last word.
//   3. Anchor poster + 35–45 word paragraph (Groq via /api/reveal).
//   4. <TasteSignature /> chips — three emoji chips from the user's vector.
//   5. <EvidenceRow /> — three signature films.
//   6. CTA row: primary "Re-rank my feed →", secondary "Share · Take it again".

import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import archetypesData from "../../../../data/dna/archetypes.json";
import { posterUrl } from "@/lib/tmdbClient";
import { TasteSignature } from "@/components/dna/TasteSignature";
import { EvidenceRow } from "@/components/dna/EvidenceRow";
import { RevealClient } from "./_RevealClient";

export const dynamic = "force-dynamic";

interface Archetype {
  key: string;
  name: string;
  tagline: string;
  anchorFilm: { title: string; tmdbId: number; year: number };
  anchorDirector: string;
  centroid: number[];
  signatureFilms?: number[];
}

const ARCHETYPES = archetypesData as unknown as Archetype[];

// Reveal-text contract: /api/reveal?archetype=KEY → { paragraph: string }.
// We tolerate failure (graceful fallback to tagline) so the page never errors.
async function getRevealParagraph(key: string): Promise<string | null> {
  try {
    const base = await siteOrigin();
    const url = `${base}/api/reveal?archetype=${encodeURIComponent(key)}&max_words=35`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { paragraph?: string };
    return typeof j.paragraph === "string" ? j.paragraph : null;
  } catch {
    return null;
  }
}

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function getAnchorPosterPath(tmdbId: number): Promise<string | null> {
  const key = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${key}`,
      { next: { revalidate: 60 * 60 * 24 } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { poster_path?: string | null };
    return j.poster_path ?? null;
  } catch {
    return null;
  }
}

function nameParts(name: string): { lead: string; accent: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { lead: "", accent: name };
  const accent = parts[parts.length - 1];
  const lead = parts.slice(0, -1).join(" ");
  return { lead, accent };
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const archetype = ARCHETYPES.find((a) => a.key === slug);
  if (!archetype) return { title: "DNA · stream·score" };
  return {
    title: `${archetype.name} · DNA · stream·score`,
    description: archetype.tagline,
  };
}

export default async function DnaRevealPage({ params }: PageProps) {
  const { slug } = await params;
  const archetype = ARCHETYPES.find((a) => a.key === slug);
  if (!archetype) notFound();

  const [paragraph, posterPath] = await Promise.all([
    getRevealParagraph(archetype.key),
    getAnchorPosterPath(archetype.anchorFilm.tmdbId),
  ]);
  const poster = posterUrl(posterPath, "w500");

  const { lead, accent } = nameParts(archetype.name);

  return (
    <article className="relative space-y-10 pb-16 pt-2 sm:space-y-14 sm:pt-6">
      {/* 1. Eyebrow */}
      <div className="num-prose flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
        <span className="h-1 w-6 rounded-full bg-[var(--color-accent)]" />
        <span>Your stream·score DNA</span>
      </div>

      {/* 2. Hero */}
      <header className="space-y-5">
        <h1 className="font-display text-[52px] leading-[0.92] tracking-[-0.01em] text-[var(--color-text)] sm:text-7xl">
          {lead && (
            <>
              <span>{lead}</span>{" "}
            </>
          )}
          <span className="italic text-[var(--color-accent)]">{accent}</span>
        </h1>
        <p className="font-display max-w-2xl text-[20px] leading-snug text-[var(--color-text)]/80 sm:text-[24px]">
          {archetype.tagline}
        </p>
      </header>

      {/* 3. Anchor poster + paragraph */}
      <section className="grid gap-6 sm:grid-cols-[180px_1fr] sm:gap-10">
        <div>
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[0_18px_50px_-30px_rgba(0,0,0,0.85)]">
            {poster ? (
              <Image
                src={poster}
                alt={`${archetype.anchorFilm.title} poster`}
                fill
                sizes="(max-width: 640px) 60vw, 180px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-bg-elevated)] to-[var(--color-undertow)]" />
            )}
          </div>
          <div className="mt-3 space-y-1">
            <div className="num-prose text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
              Anchor film
            </div>
            <Link
              href={`/movie/${archetype.anchorFilm.tmdbId}`}
              className="font-display block text-[18px] leading-tight text-[var(--color-text)] underline-offset-4 hover:underline sm:text-[20px]"
            >
              {archetype.anchorFilm.title}
              <span className="num-prose ml-2 text-[12px] text-[var(--color-subtle)]">
                {archetype.anchorFilm.year}
              </span>
            </Link>
            <div className="text-[13px] text-[var(--color-muted)]">
              dir. {archetype.anchorDirector}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <p className="font-display max-w-prose text-[18px] leading-relaxed text-[var(--color-text)]/90 sm:text-[20px]">
            {paragraph ?? archetype.tagline}
          </p>
        </div>
      </section>

      {/* 4. Taste signature chips */}
      <section className="space-y-3">
        <div className="num-prose text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
          Your taste signature
        </div>
        <TasteSignature vector={archetype.centroid} />
      </section>

      {/* 5. Films in your DNA */}
      <EvidenceRow archetype={archetype} />

      {/* 6. CTA + share row */}
      <section className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-3 text-[15px] font-medium text-black/90 transition hover:brightness-110"
        >
          Re-rank my feed
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <div className="flex items-center gap-3 text-[13px] text-[var(--color-subtle)]">
          <RevealClient archetypeKey={archetype.key} archetypeName={archetype.name} />
          <span aria-hidden>·</span>
          <Link
            href="/dna"
            className="underline-offset-4 hover:text-[var(--color-muted)] hover:underline"
          >
            Take it again
          </Link>
        </div>
      </section>
    </article>
  );
}
