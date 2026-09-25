import { NextResponse } from 'next/server';
import { getTelemetryAnalytics } from '@/lib/gemini';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = req.headers.get('x-session-id') || url.searchParams.get('session_id') || undefined;
  const analytics = getTelemetryAnalytics(sessionId);
  return NextResponse.json(analytics);
}
