import { NextRequest, NextResponse } from "next/server";
import { upsertMarketMetadata } from "@/lib/services/market.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  try {
    // API key auth
    const authHeader = req.headers.get("authorization");
    const apiKey = process.env.ADMIN_API_KEY;
    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { marketId } = await params;
    const body = await req.json();
    const { imageUrl, description, category, featured } = body;

    await upsertMarketMetadata(marketId, {
      imageUrl,
      description,
      category,
      featured,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/markets/[marketId]/metadata error:", error);
    return NextResponse.json(
      { error: "Failed to update metadata" },
      { status: 500 }
    );
  }
}
