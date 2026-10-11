import { NextResponse } from "next/server";
import { serverError } from "@/lib/http";
import { listUsers } from "@/lib/store";
import type { UsersResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const body: UsersResponse = { users: await listUsers() };
    return NextResponse.json(body);
  } catch (error) {
    return serverError("GET /api/users failed", error);
  }
}
