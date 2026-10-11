import { NextResponse } from "next/server";
import type { ErrorResponse } from "./types";

export function jsonError(
  message: string,
  status: number,
): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: message }, { status });
}

/** Logs the real cause server-side and returns a generic 500 to the client. */
export function serverError(
  context: string,
  error: unknown,
): NextResponse<ErrorResponse> {
  console.error(context, error);
  return jsonError("Internal server error", 500);
}
