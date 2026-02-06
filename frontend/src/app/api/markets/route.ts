import { NextRequest, NextResponse } from "next/server";
import { getMarkets } from "@/lib/services/market.service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category") ?? undefined;
    const featured = searchParams.has("featured")
      ? searchParams.get("featured") === "true"
      : undefined;
    const status = searchParams.get("status") as
      | "open"
      | "resolved"
      | "expired"
      | undefined;

    const markets = await getMarkets({ category, featured, status });
    return NextResponse.json(markets);
  } catch (error) {
    console.error("GET /api/markets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 }
    );
  }
}
