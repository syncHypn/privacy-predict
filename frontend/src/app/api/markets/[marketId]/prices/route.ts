import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/services/price.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  try {
    const { marketId } = await params;
    const range = (req.nextUrl.searchParams.get("range") ?? "ALL") as
      | "1H"
      | "6H"
      | "1D"
      | "1W"
      | "1M"
      | "ALL";

    const prices = await getPriceHistory(marketId, range);
    return NextResponse.json(prices);
  } catch (error) {
    console.error("GET /api/markets/[marketId]/prices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
