import { NextResponse } from 'next/server';

/** Liveness only — keep this free of engine/DB imports so App Runner health checks stay cheap. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
