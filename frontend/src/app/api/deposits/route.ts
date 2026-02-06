import { NextRequest, NextResponse } from "next/server";
import { getUserTransfers } from "@/lib/services/deposit.service";

export async function GET(req: NextRequest) {
  try {
    const user = req.nextUrl.searchParams.get("user");
    if (!user) {
      return NextResponse.json(
        { error: "user query param required" },
        { status: 400 }
      );
    }
    const data = await getUserTransfers(user);
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/deposits error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
