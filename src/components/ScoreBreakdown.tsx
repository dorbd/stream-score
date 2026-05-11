import type { AggregatedRatings } from "@/lib/types";
import { RatingBadge } from "./RatingBadge";

interface Props {
  ratings: AggregatedRatings;
  compact?: boolean;
}

export function ScoreBreakdown({ ratings, compact = false }: Props) {
  return (
    <div className={compact ? "flex flex-wrap gap-1" : "flex flex-wrap gap-1.5"}>
      <RatingBadge
        label="IMDb"
        value={ratings.imdb != null ? ratings.imdb / 10 : null}
        max={10}
        size={compact ? "sm" : "md"}
      />
      <RatingBadge
        label="RT"
        value={ratings.rottenTomatoes}
        max={100}
        size={compact ? "sm" : "md"}
      />
      <RatingBadge
        label="MC"
        value={ratings.metacritic}
        max={100}
        size={compact ? "sm" : "md"}
      />
      <RatingBadge
        label="Audience"
        value={ratings.audience}
        max={100}
        size={compact ? "sm" : "md"}
      />
    </div>
  );
}

export function CombinedScore({
  ratings,
  size = "md",
}: {
  ratings: AggregatedRatings;
  size?: "sm" | "md" | "lg";
}) {
  const score = ratings.combined;
  const tone =
    score == null
      ? "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
      : score >= 80
        ? "bg-emerald-500 text-white"
        : score >= 65
          ? "bg-lime-500 text-zinc-900"
          : score >= 50
            ? "bg-amber-500 text-zinc-900"
            : "bg-rose-500 text-white";

  const sizeClass =
    size === "lg"
      ? "h-16 w-16 text-2xl"
      : size === "sm"
        ? "h-9 w-9 text-sm"
        : "h-12 w-12 text-lg";

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-full font-semibold tabular-nums ${tone} ${sizeClass}`}
      title={
        score == null
          ? "Not enough rating data"
          : `Combined score: ${score} / 100 (${ratings.available.join(", ") || "none"}${ratings.providerBoost ? ` +${ratings.providerBoost} provider` : ""})`
      }
    >
      {score == null ? "—" : Math.round(score)}
    </div>
  );
}
