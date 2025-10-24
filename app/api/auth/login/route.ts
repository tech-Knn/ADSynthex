import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAllowedFeeds, ACCOUNT_FEED_ACCESS } from '@/lib/account-access-control';

// Define a fallback admin key only if environment variables fail
const ADMIN_FALLBACK_KEY = "admin@2024#secure";

// Build customer accounts list from ACCOUNT_FEED_ACCESS
const CUSTOMER_ACCOUNTS = Object.keys(ACCOUNT_FEED_ACCESS).map(accountId => ({
  id: accountId,
  value: accountId.replace('CID_', '')
}));

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { type, accountId } = body;
    
    // For admin login, validate against environment key
    if (type === 'admin') {
      const apiKey = request.headers.get('X-API-KEY');
      
      // Check if API key is provided
      if (!apiKey) {
        return NextResponse.json(
          { error: 'Missing admin key' },
          { status: 401 }
        );
      }
      
      // Log environment variable load status for debugging
      console.log('ASX_LOGIN_KEY environment variable:', process.env.ASX_LOGIN_KEY ? 'Set' : 'Not set');
      
      // Validate against environment key (prioritize the .env.local key)
      const validKey = process.env.ASX_LOGIN_KEY || ADMIN_FALLBACK_KEY;
      if (apiKey !== validKey) {
        console.log('Invalid admin key provided');
        return NextResponse.json(
          { error: 'Invalid admin key' },
          { status: 401 }
        );
      }
      
      // Set cookies/session for admin
      const sessionId = Math.random().toString(36).substring(2, 15);
      const cookieStore = cookies();
      cookieStore.set('auth_type', 'admin', { path: '/' });
      cookieStore.set('session_id', sessionId, { path: '/' });
      
      console.log('Admin login successful');
      
      return NextResponse.json({ success: true, type: 'admin' });
    } 
    // For user login, validate account ID
    else if (type === 'user') {
      // Check if account ID exists
      const accountExists = CUSTOMER_ACCOUNTS.some(account => 
        account.id === accountId || 
        account.id === `CID_${accountId}` || 
        account.value === accountId
      );
      
      if (!accountExists) {
        console.log('Invalid account ID:', accountId);
        return NextResponse.json(
          { error: 'Invalid account ID' },
          { status: 401 }
        );
      }
      
      // Standardize the account ID format (with CID_ prefix)
      let normalizedAccountId = accountId;
      if (!accountId.startsWith('CID_')) {
        // Check if it's a value rather than an ID
        const accountByValue = CUSTOMER_ACCOUNTS.find(acc => acc.value === accountId);
        if (accountByValue) {
          normalizedAccountId = accountByValue.id;
        } else {
          normalizedAccountId = `CID_${accountId}`;
        }
      }
      
      // Get allowed feeds for this account
      const allowedFeeds = getAllowedFeeds(normalizedAccountId);

      // Set cookies/session for user
      const sessionId = Math.random().toString(36).substring(2, 15);
      const cookieStore = cookies();
      cookieStore.set('auth_type', 'user', { path: '/' });
      cookieStore.set('account_id', normalizedAccountId, { path: '/' });
      cookieStore.set('session_id', sessionId, { path: '/' });

      // No longer using Supabase
      console.log('User login successful for account:', normalizedAccountId, 'with feeds:', allowedFeeds);

      return NextResponse.json({
        success: true,
        type: 'user',
        accountId: normalizedAccountId,
        allowedFeeds
      });
    }
    
    // Invalid login type
    return NextResponse.json(
      { error: 'Invalid login type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication error' },
      { status: 500 }
    );
  }
} 