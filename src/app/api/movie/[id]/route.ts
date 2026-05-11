import { NextRequest, NextResponse } from "next/server";
import { getMovieDetail } from "@/lib/tmdbClient";
import { buildMovieResultFromDetail } from "@/lib/buildMovieResult";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const movieId = Number(id);
    if (!Number.isFinite(movieId)) {
      return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
    }
    const sp = req.nextUrl.searchParams;
    const region = (process.env.NEXT_PUBLIC_TMDB_REGION || "US").toUpperCase();
    const selectedKeys = (sp.get("providers") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const detail = await getMovieDetail(movieId);
    const result = await buildMovieResultFromDetail(detail, {
      region,
      selectedProviderKeys: selectedKeys,
    });
    return NextResponse.json({
      result,
      detail: {
        cast: detail.cast,
        director: detail.director,
        tagline: detail.tagline,
        spokenLanguages: detail.spokenLanguages.map((l) => l.english_name),
        productionCountries: detail.productionCountries.map((c) => c.name),
        status: detail.status,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
