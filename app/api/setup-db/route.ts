// app/api/setup-db/route.ts
// One-Time Database Setup - Creates All Indexes

import { NextResponse } from 'next/server';
import { setupAllIndexes, listAllIndexes } from '@/lib/db/setup-indexes';
import { testConnection } from '@/lib/db/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('[SETUP_DB] Starting database setup...');

    // Test connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      return NextResponse.json({
        success: false,
        error: 'Failed to connect to MongoDB'
      }, { status: 500 });
    }

    console.log('[SETUP_DB] MongoDB connection verified ✓');

    // Create all indexes
    console.log('[SETUP_DB] Creating indexes...');
    await setupAllIndexes();

    // List all created indexes
    const indexes = await listAllIndexes();

    // Count total indexes
    let totalIndexes = 0;
    const indexSummary: any = {};

    for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
      const count = (collectionIndexes as any[]).length;
      totalIndexes += count;
      indexSummary[collectionName] = {
        count,
        indexes: (collectionIndexes as any[]).map((idx: any) => idx.name)
      };
    }

    console.log('[SETUP_DB] ✓ Database setup complete!');
    console.log(`[SETUP_DB] Total indexes created: ${totalIndexes}`);

    return NextResponse.json({
      success: true,
      message: 'Database setup complete!',
      summary: {
        totalIndexes,
        collections: Object.keys(indexes).length,
        details: indexSummary
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[SETUP_DB] Setup failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
}

// POST endpoint for manual trigger with action parameter
export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    if (action === 'setup') {
      console.log('[SETUP_DB] Creating indexes...');
      await setupAllIndexes();

      return NextResponse.json({
        success: true,
        message: 'Indexes created successfully'
      });
    }

    if (action === 'list') {
      console.log('[SETUP_DB] Listing indexes...');
      const indexes = await listAllIndexes();

      return NextResponse.json({
        success: true,
        indexes
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use "setup" or "list"'
    }, { status: 400 });

  } catch (error: any) {
    console.error('[SETUP_DB] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
