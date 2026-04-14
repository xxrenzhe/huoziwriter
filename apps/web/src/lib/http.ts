import { NextResponse } from "next/server";

export function ok<T>(data: T) {
  return NextResponse.json({ success: true, data });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function failWithData<T>(message: string, status: number, data: T) {
  return NextResponse.json({ success: false, error: message, data }, { status });
}
