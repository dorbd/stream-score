import { NextResponse } from "next/server";
import { getMovieGenres } from "@/lib/tmdbClient";

export async function GET() {
  try {
    const genres = await getMovieGenres();
    return NextResponse.json({ genres });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
