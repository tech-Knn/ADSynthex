/**
 * Application Error Classes
 * Centralized error handling
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier ${identifier} not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', public readonly retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: Error) {
    super(
      `External service error: ${service}`,
      'EXTERNAL_SERVICE_ERROR',
      502
    );
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

