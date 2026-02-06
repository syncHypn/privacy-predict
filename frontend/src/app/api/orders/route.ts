import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/services/order.service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const user = searchParams.get("user") ?? undefined;
    const market = searchParams.get("market") ?? undefined;
    const page = Number(searchParams.get("page") ?? 1);
    const limit = Number(searchParams.get("limit") ?? 50);

    const result = await getOrders({ user, market, page, limit });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/orders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
