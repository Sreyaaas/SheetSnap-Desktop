import { NextResponse } from 'next/server';
import { resetTelemetryStats } from '@/lib/gemini';

export async function POST() {
  const stats = resetTelemetryStats();
  return NextResponse.json({
    status: 'ok',
    message: 'Analytics telemetry reset successfully',
    stats,
  });
}
