import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Get session ID from cookies
    const cookieStore = cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    
    // Clear all cookies
    cookieStore.delete('auth_type');
    cookieStore.delete('session_id');
    cookieStore.delete('account_id');
    
    console.log('Logout successful for session:', sessionId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
} 