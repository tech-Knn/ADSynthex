import { NextRequest, NextResponse } from 'next/server';

// Function to validate against the exact environment key
const validateExactKey = (apiKey: string | null): boolean => {
  if (!apiKey) {
    return false;
  }
  
  // Get the key from environment variable
  const envKey = process.env.ASX_LOGIN_KEY;

  console.log('Validating key, env key length:', envKey ? envKey.length : 'not set');

  return envKey === apiKey;

};

export async function POST(request: NextRequest) {
  try {
    // Get the API key from the header
    const apiKey = request.headers.get('X-API-KEY');
    
    // Check if API key is provided
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401 }
      );
    }
    
    // Check against the exact environment variable key
    if (!validateExactKey(apiKey)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }
    
    // For testing purposes, log environment variables
    console.log('Environment variables available:');
    console.log('ASX_LOGIN_KEY:', process.env.ASX_LOGIN_KEY ? `Set (length: ${process.env.ASX_LOGIN_KEY.length})` : 'Not set');
    
    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('API key validation error:', error);
    return NextResponse.json(
      { error: 'API key validation error' },
      { status: 500 }
    );
  }
} 