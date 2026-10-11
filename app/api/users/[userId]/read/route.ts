import { NextResponse } from "next/server";
import { jsonError, serverError } from "@/lib/http";
import { getUser, isValidUserId, markRead } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const { userId } = await params;
  if (!isValidUserId(userId)) {
    return jsonError("Invalid userId", 400);
  }

  try {
    if (!(await getUser(userId))) {
      return jsonError("User not found", 404);
    }
    await markRead(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("POST /api/users/[userId]/read failed", error);
  }
}
