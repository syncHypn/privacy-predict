import { NextResponse } from "next/server";
import { getOverviewStats } from "@/lib/services/stats.service";

export async function GET() {
  try {
    const stats = await getOverviewStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/stats/overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
