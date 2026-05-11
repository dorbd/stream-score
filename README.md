# stream·score

> What should I watch tonight? — Movie discovery filtered by the streaming
> services you actually pay for, ranked by aggregated IMDb / Rotten Tomatoes /
> Metacritic / audience scores.

Built with Next.js 16 App Router, TypeScript, and Tailwind CSS v4. Server-side
calls to the TMDb and OMDb APIs; user provider selection is persisted to
`localStorage` (no account, no sync, no tracking).

## Features

- **Provider-aware discovery** — pick the services you subscribe to (Netflix,
  Hulu, Max, Disney+, Apple TV+, Prime Video, Paramount+, Peacock, plus
  rental/purchase storefronts like Apple TV, Amazon Video, Google Play,
  YouTube, Vudu, Microsoft Store).
- **Combined recommendation score** — weighted blend of IMDb (40%), Rotten
  Tomatoes (30%), Metacritic (15%), and TMDb audience score (15%). Missing
  scores are skipped; the weighting adapts to whatever sources exist. A small
  boost is applied when the movie is available on one of your selected
  services.
- **Multi-source ratings** — IMDb / RT / Metacritic via OMDb; TMDb audience
  proxy via vote-average. Each score is shown as a badge with N/A fallback —
  never crashes on missing data.
- **Filters** — genre, year range, minimum rating, runtime cap, language,
  sort by best overall / highest IMDb / newest / oldest / shortest / longest.
- **Search** — free-text title search alongside discovery filters.
- **Movie detail page** — full ratings breakdown, cast, director, tagline,
  per-region streaming/rent/buy/free availability with provider logos, and
  outbound links to IMDb, TMDb, and JustWatch.
- **Mobile-first UI** — sticky header, responsive grid, dark mode via system
  preference, accessible focus states, no layout shift on image load.

## Tech stack

| Layer            | Choice                                       |
| ---------------- | -------------------------------------------- |
| Framework        | Next.js 16 (App Router, Turbopack, RSC)      |
| Language         | TypeScript                                   |
| Styling          | Tailwind CSS v4                              |
| Data sources     | TMDb v3 + OMDb (server-side fetch)           |
| State (client)   | React hooks + `localStorage`                 |
| Deployment       | Vercel (recommended), or any Node 20.9+ host |

## Setup

```bash
# 1. Install deps
npm install

# 2. Add API keys
cp .env.example .env.local
# Edit .env.local with your TMDB_API_KEY (required) and OMDB_API_KEY (optional)

# 3. Run
npm run dev
# → http://localhost:3000
```

### Required environment variables

| Variable                  | Required | What it does                                                                |
| ------------------------- | -------- | --------------------------------------------------------------------------- |
| `TMDB_API_KEY`            | **Yes**  | TMDb v3 API key. Used for discovery, search, metadata, and watch providers. |
| `OMDB_API_KEY`            | No       | OMDb key. Adds IMDb/RT/Metacritic scores. App degrades gracefully if unset. |
| `NEXT_PUBLIC_TMDB_REGION` | No       | ISO 3166-1 region for watch providers. Defaults to `US`.                    |

### Getting keys

- **TMDb** — Sign up at https://www.themoviedb.org/signup, then request an API
  key under Settings → API (pick the free Developer tier). Use the **v3 API
  key** (32-char hex), not the v4 read access token.
- **OMDb** — Request a free key at https://www.omdbapi.com/apikey.aspx (1,000
  requests/day on the free tier).

## Available scripts

```bash
npm run dev    # next dev (Turbopack)
npm run build  # next build (Turbopack)
npm start      # next start (production server)
npm run lint   # eslint
```

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── discover/route.ts        # GET — list movies with filters
│   │   ├── genres/route.ts          # GET — TMDb genre catalog
│   │   └── movie/[id]/route.ts      # GET — single movie with availability
│   ├── movie/[id]/
│   │   ├── page.tsx                 # Server component — full detail
│   │   └── _MovieDetailClient.tsx   # Client component — availability vs. user
│   ├── settings/page.tsx            # Provider selection / onboarding
│   ├── _DiscoverClient.tsx          # Client component — home page UX
│   ├── layout.tsx
│   └── page.tsx                     # Home (discovery)
├── components/                      # MovieCard, MovieFilters, ProviderSelector,
│                                    # RatingBadge, ScoreBreakdown, EmptyState,
│                                    # LoadingState, Header
├── hooks/
│   └── useSelectedProviders.ts      # localStorage-backed provider state
└── lib/
    ├── buildMovieResult.ts          # TMDb+OMDb → MovieResult composition
    ├── cn.ts                        # className helper
    ├── omdbClient.ts                # OMDb fetcher (typed)
    ├── providerMapper.ts            # TMDb provider → canonical ProviderTag
    ├── providers.ts                 # Provider catalog (Netflix, Hulu, …)
    ├── ratingsAggregator.ts         # Weighted combined score
    ├── tmdbClient.ts                # TMDb v3 client (typed)
    └── types.ts                     # Shared types
```

## Scoring methodology

`combineRatings` produces a 0–100 score from the available signals:

```
combined = Σ(score_i × weight_i) / Σ(weight_i)  for i in available_sources
         + providerBoost                          (+3 if on user's services)
```

Default weights (`src/lib/ratingsAggregator.ts`):

- IMDb rating × 10 → 0–100 (weight 0.40)
- Rotten Tomatoes Tomatometer → 0–100 (weight 0.30)
- Metacritic Metascore → 0–100 (weight 0.15)
- TMDb audience proxy (vote_average × 10, min 100 votes) → 0–100 (weight 0.15)

If a source is missing, its weight is removed from the denominator — so a
movie with only IMDb + Metacritic still gets a fair, non-penalized score.

A movie that's currently streamable on one of the user's selected services
gets a +3 nudge. The boost is intentionally small — better-rated movies still
win.

## API notes & limitations

- **Rotten Tomatoes / Metacritic** scores come from OMDb's free tier. OMDb
  exposes the *Tomatometer* (critic) and *Metascore*. The **Popcornmeter /
  audience score** is not in OMDb's free tier — the app currently uses TMDb's
  vote-average as the audience proxy. `RatingBadge` is data-source-agnostic,
  so plugging in a real Popcornmeter feed later is a one-file change.
- **Region** — Watch-provider data is region-scoped. We default to `US`. Set
  `NEXT_PUBLIC_TMDB_REGION` if you're elsewhere.
- **Pagination** — TMDb caps discovery at 500 pages × 20 results. We expose
  Load More up to whatever TMDb returns.
- **Rate limits** — TMDb is generous (~50 req/sec per IP). OMDb free tier is
  1,000/day. Each movie card on the home page issues 1 TMDb detail call +
  1 OMDb call. Page sizes are 20, so a single discovery page = ~40 upstream
  calls. For production scale, add a Redis/Vercel KV cache in front of the
  client modules.
- **No scraping** — Rotten Tomatoes is not scraped. If you want the official
  Popcornmeter, you'd need direct RT licensing or a paid aggregator
  (Watchmode, Reelgood) — neither of which is wired up here.

## Future improvements

- Plug in **Watchmode** or **Reelgood** for: real Popcornmeter, broader
  rent/buy price data, more accurate availability windows.
- Add **persistent watchlist** (currently localStorage-only).
- Add **TV shows** alongside movies (TMDb supports `/discover/tv`).
- **Server-side caching** with Vercel KV to stay under OMDb's daily quota
  even at moderate traffic.
- **Multi-region** support — pick region in settings, not via env var.
- **Account sync** (Clerk/Auth.js) if a user wants their service list across
  devices.
- **AI "vibe" search** — describe the kind of movie you want; the server
  embeds the description and reranks results.

## License

MIT — go nuts.
