/**
 * Error Handler Utility
 * Converts errors to API responses
 */

import { NextResponse } from 'next/server';
import { AppError } from './AppError';

export function handleApiError(error: unknown): NextResponse {
  console.error('API Error:', error);

  // Handle known AppError instances
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error.message,
          code: error.code
        }
      },
      { status: error.statusCode }
    );
  }

  // Handle validation errors
  if (error instanceof Error && error.name === 'ValidationError') {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error.message,
          code: 'VALIDATION_ERROR'
        }
      },
      { status: 400 }
    );
  }

  // Handle generic errors
  return NextResponse.json(
    {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    },
    { status: 500 }
  );
}

export function logError(error: unknown, context?: Record<string, any>): void {
  console.error('Error:', {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    context
  });
}

