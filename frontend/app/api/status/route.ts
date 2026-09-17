import { NextResponse } from 'next/server';
import { isGeminiConfigured } from '@/lib/gemini';

export async function GET() {
  const isAvailable = isGeminiConfigured();
  return NextResponse.json({
    status: 'healthy',
    gemini_available: isAvailable,
    gemini_model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    architecture: 'Full-Stack Next.js (Zero Python / In-Memory)',
    guardrails: {
      max_file_size_mb: 10,
      supported_formats: ['PDF', 'PNG', 'JPG', 'WebP'],
      rate_limit: '25 req/min per IP with auto-ban mitigation',
    },
  });
}
