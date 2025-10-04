import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Define a fallback admin key only if environment variables fail
const ADMIN_FALLBACK_KEY = "admin@2024#secure";

// Customer accounts list to validate against
const CUSTOMER_ACCOUNTS = [
  {
    id: 'CID_8677814915',
    name: 'Ads.com - RSOC - IST',
    value: '8677814915'
  },
  {
    id: 'CID_9071440966',
    name: 'Ads.com - RSOC - UTC - 02',
    value: '9071440966'
  },
  {
    id: 'CID_5723554317',
    name: 'Ads.com - RSOC - UTC - 03',
    value: '5723554317'
  },
  {
    id: 'CID_3146253756',
    name: 'Ads.com - RSOC - UTC - 04',
    value: '3146253756'
  },
  {
    id: 'CID_5857090949',
    name: 'Ads.com - RSOC - UTC - 05',
    value: '5857090949'
  },
  {
    id: 'CID_6201189752',
    name: 'Ads.com - RSOC - UTC - 06',
    value: '6201189752'
  },
  {
    id: 'CID_4071621621',
    name: 'Ads.com - RSOC - UTC - 07',
    value: '4071621621'
  },
  {
    id: 'CID_7579121709',
    name: 'Ads.com - RSOC - UTC - 08',
    value: '7579121709'
  },
  {
    id: 'CID_1918795911',
    name: 'Ads.com - RSOC - UTC - 09',
    value: '1918795911'
  },
  {
    id: 'CID_2849704713',
    name: 'Ads.com - RSOC - UTC - 10',
    value: '2849704713'
  },
  {
    id: 'CID_7605096292',
    name: 'Ads.com - RSOC - UTC - 11',
    value: '7605096292'
  },
  {
    id: 'CID_5719842337',
    name: 'Ads.com - RSOC - UTC - 12',
    value: '5719842337'
  },
  {
    id: 'CID_9341614254',
    name: 'Ads.com - RSOC - UTC - 13',
    value: '9341614254'
  },
  {
    id: 'CID_9790364217',
    name: 'Ads.com - UTC - 14',
    value: '9790364217'
  },
  {
    id: 'CID_2420687578',
    name: 'Ads.com - UTC - 16',
    value: '2420687578'
  },
  {
    id: 'CID_6324595978',
    name: 'Ads.com - RSOC - UTC - 17',
    value: '6324595978'
  },
  {
    id: 'CID_5133038944',
    name: 'Ads.com - RSOC - UTC - 18',
    value: '5133038944'
  },
  {
    id: 'CID_9084731648',
    name: 'Ads.com - RSOC - UTC - 19',
    value: '9084731648'
  },
  {
    id: 'CID_5109995931',
    name: 'Ads.com - RSOC - UTC - 20',
    value: '5109995931'
  },
  {
    id: 'CID_8807720960',
    name: 'Ads.com - RSOC - UTC - Yahoo',
    value: '8807720960'
  },
  {
    id: 'CID_4277350349',
    name: 'RSOC - UTC - Ads.com',
    value: '4277350349'
  }
];

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
      
      // Set cookies/session for user
      const sessionId = Math.random().toString(36).substring(2, 15);
      const cookieStore = cookies();
      cookieStore.set('auth_type', 'user', { path: '/' });
      cookieStore.set('account_id', normalizedAccountId, { path: '/' });
      cookieStore.set('session_id', sessionId, { path: '/' });
      
      // No longer using Supabase
      console.log('User login successful for account:', normalizedAccountId);
      
      return NextResponse.json({ 
        success: true, 
        type: 'user', 
        accountId: normalizedAccountId
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