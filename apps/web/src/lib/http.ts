import { NextResponse } from "next/server";

export function ok<T>(data: T) {
  return NextResponse.json({ success: true, data });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
