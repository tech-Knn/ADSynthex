/**
 * Error Handling Utilities
 * Centralized error handling and logging
 */

export enum ErrorCode {
  // API Errors
  API_REQUEST_FAILED = 'API_REQUEST_FAILED',
  API_TIMEOUT = 'API_TIMEOUT',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_UNAUTHORIZED = 'API_UNAUTHORIZED',
  API_NOT_FOUND = 'API_NOT_FOUND',

  // Validation Errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_DATE_FORMAT = 'INVALID_DATE_FORMAT',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Data Errors
  DATA_TRANSFORMATION_FAILED = 'DATA_TRANSFORMATION_FAILED',
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  EMPTY_RESPONSE = 'EMPTY_RESPONSE',

  // Configuration Errors
  MISSING_CONFIG = 'MISSING_CONFIG',
  INVALID_CONFIG = 'INVALID_CONFIG',

  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

/**
 * Logger utility for consistent logging across the application
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, data?: any) {
    console.log(`[${this.context}] INFO: ${message}`, data || '');
  }

  error(message: string, error?: any) {
    console.error(`[${this.context}] ERROR: ${message}`, error || '');
  }

  warn(message: string, data?: any) {
    console.warn(`[${this.context}] WARN: ${message}`, data || '');
  }

  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${this.context}] DEBUG: ${message}`, data || '');
    }
  }

  /**
   * Log API request
   */
  logApiRequest(method: string, url: string, params?: any) {
    this.info(`API Request: ${method} ${url}`, params);
  }

  /**
   * Log API response
   */
  logApiResponse(method: string, url: string, status: number, duration?: number) {
    const durationText = duration ? ` (${duration}ms)` : '';
    this.info(`API Response: ${method} ${url} - ${status}${durationText}`);
  }

  /**
   * Log API error
   */
  logApiError(method: string, url: string, error: any) {
    this.error(`API Error: ${method} ${url}`, error);
  }
}

/**
 * Error handler for API routes
 */
export function handleApiError(error: any, logger?: Logger): AppError {
  // Handle known AppError instances
  if (error instanceof AppError) {
    if (logger) {
      logger.error(error.message, error.details);
    }
    return error;
  }

  // Handle axios errors
  if (error.response) {
    const status = error.response.status;

    if (status === 401 || status === 403) {
      return new AppError(
        ErrorCode.API_UNAUTHORIZED,
        'Authentication failed. Please check your API credentials.',
        status,
        { response: error.response.data }
      );
    }

    if (status === 404) {
      return new AppError(
        ErrorCode.API_NOT_FOUND,
        'The requested resource was not found.',
        status,
        { response: error.response.data }
      );
    }

    if (status === 429) {
      return new AppError(
        ErrorCode.API_RATE_LIMIT,
        'Rate limit exceeded. Please try again later.',
        status,
        { response: error.response.data }
      );
    }

    if (status >= 500) {
      return new AppError(
        ErrorCode.API_REQUEST_FAILED,
        'The API server encountered an error. Please try again later.',
        status,
        { response: error.response.data }
      );
    }
  }

  // Handle timeout errors
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return new AppError(
      ErrorCode.API_TIMEOUT,
      'The API request timed out. Please try again.',
      408,
      { originalError: error.message }
    );
  }

  // Handle network errors
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return new AppError(
      ErrorCode.API_REQUEST_FAILED,
      'Unable to connect to the API server. Please check your network connection.',
      503,
      { code: error.code }
    );
  }

  // Handle validation errors
  if (error.message?.includes('Invalid')) {
    return new AppError(
      ErrorCode.VALIDATION_FAILED,
      error.message,
      400,
      { originalError: error }
    );
  }

  // Default unknown error
  if (logger) {
    logger.error('Unknown error occurred', error);
  }

  return new AppError(
    ErrorCode.UNKNOWN_ERROR,
    error.message || 'An unexpected error occurred.',
    500,
    { originalError: error }
  );
}

/**
 * Retry helper for API requests
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  logger?: Logger
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const delay = initialDelay * Math.pow(2, attempt - 1);

      if (logger) {
        logger.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`, error);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function validateDateFormat(date: string): void {
  const regex = /^\d{4}-\d{2}-\d{2}$/;

  if (!regex.test(date)) {
    throw new AppError(
      ErrorCode.INVALID_DATE_FORMAT,
      `Invalid date format: ${date}. Expected format: YYYY-MM-DD`,
      400,
      { providedDate: date }
    );
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new AppError(
      ErrorCode.INVALID_DATE_FORMAT,
      `Invalid date: ${date}`,
      400,
      { providedDate: date }
    );
  }
}

/**
 * Validate date range
 */
export function validateDateRange(startDate: string, endDate: string): void {
  validateDateFormat(startDate);
  validateDateFormat(endDate);

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw new AppError(
      ErrorCode.INVALID_DATE_RANGE,
      'Start date must be before or equal to end date',
      400,
      { startDate, endDate }
    );
  }
}

/**
 * Safe JSON parse with error handling
 */
export function safeJSONParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return defaultValue;
  }
}
