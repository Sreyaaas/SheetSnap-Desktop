import { NextResponse } from 'next/server';
import { getTelemetryAnalytics } from '@/lib/gemini';

export async function GET() {
  const analytics = getTelemetryAnalytics();
  return NextResponse.json(analytics);
}
