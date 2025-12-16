/**
 * MongoDB Setup Endpoint
 * Run once after deployment to create all indexes
 *
 * Usage: POST /api/setup-mongodb with { secret: "your_secret" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { testConnection, setupAllIndexes, getHealthStatus } from '@/lib/db/mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Security check
    if (body.secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[SETUP_MONGODB] Starting MongoDB setup...');

    // Step 1: Test connection
    console.log('[SETUP_MONGODB] Testing MongoDB connection...');
    const connectionTest = await testConnection();

    if (!connectionTest.connected) {
      return NextResponse.json({
        success: false,
        error: 'MongoDB connection failed',
        details: connectionTest,
      }, { status: 500 });
    }

    console.log('[SETUP_MONGODB] ✓ MongoDB connection successful');

    // Step 2: Create indexes
    console.log('[SETUP_MONGODB] Creating indexes...');
    await setupAllIndexes();
    console.log('[SETUP_MONGODB] ✓ All indexes created');

    // Step 3: Get health status
    const health = await getHealthStatus();

    return NextResponse.json({
      success: true,
      message: 'MongoDB setup completed successfully',
      connection: connectionTest,
      health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[SETUP_MONGODB] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'MongoDB Setup Endpoint',
    usage: 'POST with { secret: "your_cron_secret" } to run setup',
    steps: [
      '1. Test MongoDB connection',
      '2. Create all collection indexes',
      '3. Return health status',
    ],
  });
}
