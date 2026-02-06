import { NextRequest, NextResponse } from "next/server";
import { getMarket } from "@/lib/services/market.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  try {
    const { marketId } = await params;
    const market = await getMarket(marketId);
    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }
    return NextResponse.json(market);
  } catch (error) {
    console.error("GET /api/markets/[marketId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market" },
      { status: 500 }
    );
  }
}
