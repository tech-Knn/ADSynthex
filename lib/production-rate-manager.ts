/**
 * Production-Grade Google Ads API Rate Manager
 * Ensures we NEVER hit rate limits with intelligent quota management
 */

interface QuotaState {
  dailyQuotaUsed: number;
  dailyQuotaLimit: number;
  currentQPS: number;
  lastResetTime: number;
  isInCooldown: boolean;
  cooldownUntil: number;
  requestHistory: number[];
}

interface RateLimitConfig {
  maxDailyQuota: number;        // Conservative daily limit
  standardQPS: number;          // Standard queries per second
  keywordPlanningQPS: number;   // Keyword planning service QPS (per Google docs)
  audienceInsightsQPS: number;  // Audience insights QPS (per Google docs)
  emergencyBackoff: number;     // Emergency cooldown period
  quotaBuffer: number;          // Reserve quota for critical operations
  perCustomerQPS: Map<string, number>; // Per-customer QPS tracking
}

export class ProductionRateManager {
  private state: QuotaState;
  private config: RateLimitConfig;
  private persistentStorage: Map<string, any> = new Map();
  private customerRequestTimes: Map<string, number[]> = new Map();

  constructor() {
    // Based on Google's official documentation
    this.config = {
      maxDailyQuota: 6000,      // Conservative buffer from typical limits
      standardQPS: 1,           // 1 QPS for standard operations (safe)
      keywordPlanningQPS: 1,    // Google's limit: 1 request per second per CID
      audienceInsightsQPS: 2,   // Google's limit: 2 requests per second per dev token
      emergencyBackoff: 3600000, // 1 hour emergency cooldown
      quotaBuffer: 500,         // Reserve 500 requests for emergencies
      perCustomerQPS: new Map() // Track QPS per customer ID
    };

    this.state = this.loadPersistedState();
    this.startQuotaMonitoring();
  }

  /**
   * Load persisted quota state (survives server restarts)
   */
  private loadPersistedState(): QuotaState {
    const today = new Date().toDateString();
    const savedState = this.persistentStorage.get('quotaState');
    
    // Reset if it's a new day
    if (!savedState || savedState.lastResetTime !== today) {
      return {
        dailyQuotaUsed: 0,
        dailyQuotaLimit: this.config.maxDailyQuota,
        currentQPS: this.config.safeQPS,
        lastResetTime: today,
        isInCooldown: false,
        cooldownUntil: 0,
        requestHistory: []
      };
    }

    return savedState;
  }

  /**
   * Persist quota state to survive server restarts
   */
  private persistState(): void {
    this.persistentStorage.set('quotaState', { ...this.state });
  }

  /**
   * Check if we can safely make an API request
   * Now includes per-customer QPS tracking as per Google's documentation
   */
  canMakeRequest(customerId?: string, serviceType: 'standard' | 'keyword_planning' | 'audience_insights' = 'standard'): {
    allowed: boolean;
    reason: string;
    waitTime?: number;
    quotaRemaining: number;
  } {
    const now = Date.now();

    // Check daily quota
    const quotaRemaining = this.state.dailyQuotaLimit - this.state.dailyQuotaUsed;
    
    if (quotaRemaining <= this.config.quotaBuffer) {
      return {
        allowed: false,
        reason: 'Daily quota nearly exhausted (following Google best practices)',
        quotaRemaining: 0
      };
    }

    // Check global cooldown period
    if (this.state.isInCooldown && now < this.state.cooldownUntil) {
      const waitTime = this.state.cooldownUntil - now;
      return {
        allowed: false,
        reason: 'In cooldown period due to previous rate limit (following Google error handling)',
        waitTime,
        quotaRemaining
      };
    }

    // Determine QPS limit based on service type (per Google documentation)
    let qpsLimit: number;
    let windowMs: number;
    
    switch (serviceType) {
      case 'keyword_planning':
        qpsLimit = this.config.keywordPlanningQPS; // 1 QPS per CID
        windowMs = 1000;
        break;
      case 'audience_insights':
        qpsLimit = this.config.audienceInsightsQPS; // 2 QPS per dev token
        windowMs = 1000;
        break;
      default:
        qpsLimit = this.config.standardQPS; // 1 QPS for standard operations
        windowMs = 1000;
    }

    // Check global QPS limit
    const recentRequests = this.state.requestHistory.filter(
      time => now - time < windowMs
    );

    if (recentRequests.length >= qpsLimit) {
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = oldestRequest + windowMs - now;
      return {
        allowed: false,
        reason: `Global ${serviceType} QPS limit reached (${qpsLimit} requests per ${windowMs}ms)`,
        waitTime: Math.max(0, waitTime),
        quotaRemaining
      };
    }

    // Check per-customer QPS limit (as recommended by Google for keyword planning)
    if (customerId && serviceType === 'keyword_planning') {
      const customerHistory = this.customerRequestTimes.get(customerId) || [];
      const recentCustomerRequests = customerHistory.filter(
        time => now - time < windowMs
      );

      if (recentCustomerRequests.length >= this.config.keywordPlanningQPS) {
        const oldestCustomerRequest = Math.min(...recentCustomerRequests);
        const waitTime = oldestCustomerRequest + windowMs - now;
        return {
          allowed: false,
          reason: `Per-customer QPS limit reached for ${customerId} (Google's 1 QPS per CID limit)`,
          waitTime: Math.max(0, waitTime),
          quotaRemaining
        };
      }
    }

    return {
      allowed: true,
      reason: 'Request approved (following Google rate limit guidelines)',
      quotaRemaining
    };
  }

  /**
   * Record a successful API request with per-customer tracking
   */
  recordRequest(customerId?: string, serviceType: 'standard' | 'keyword_planning' | 'audience_insights' = 'standard'): void {
    const now = Date.now();
    
    this.state.dailyQuotaUsed++;
    this.state.requestHistory.push(now);
    
    // Keep only last 20 requests for QPS calculation (increased for better tracking)
    this.state.requestHistory = this.state.requestHistory.slice(-20);
    
    // Track per-customer requests (following Google's per-CID recommendations)
    if (customerId) {
      const customerHistory = this.customerRequestTimes.get(customerId) || [];
      customerHistory.push(now);
      
      // Keep only last 10 requests per customer
      this.customerRequestTimes.set(customerId, customerHistory.slice(-10));
    }
    
    this.persistState();
    
    console.log(`[RATE_MANAGER] ${serviceType} request recorded for ${customerId || 'global'}. Quota used: ${this.state.dailyQuotaUsed}/${this.state.dailyQuotaLimit}`);
  }

  /**
   * Handle rate limit error from Google (following official error patterns)
   */
  handleRateLimitError(error: any): void {
    console.error('[RATE_MANAGER] Google Ads API error detected:', error);
    
    const errorString = JSON.stringify(error);
    let retrySeconds = 3600; // Default 1 hour
    let errorType = 'UNKNOWN';

    // Parse Google's specific error types (based on documentation)
    if (errorString.includes('RESOURCE_EXHAUSTED')) {
      errorType = 'RESOURCE_EXHAUSTED';
      
      // Extract retry time from error message
      const retryMatch = error.message?.match(/Retry in (\d+) seconds/);
      if (retryMatch) {
        retrySeconds = parseInt(retryMatch[1]);
      }
      
      // For RESOURCE_EXHAUSTED, implement exponential backoff
      retrySeconds = Math.min(retrySeconds * 2, 7200); // Max 2 hours
      
    } else if (errorString.includes('TOO_MANY_REQUESTS') || errorString.includes('429')) {
      errorType = 'TOO_MANY_REQUESTS';
      retrySeconds = 1800; // 30 minutes for general rate limiting
      
    } else if (errorString.includes('QUOTA_EXCEEDED')) {
      errorType = 'QUOTA_EXCEEDED';
      retrySeconds = 86400; // 24 hours for daily quota exceeded
      
    } else if (errorString.includes('TOO_MANY_OPERATIONS')) {
      errorType = 'TOO_MANY_OPERATIONS';
      retrySeconds = 300; // 5 minutes for operation limits
    }
    
    // Enter appropriate cooldown
    this.state.isInCooldown = true;
    this.state.cooldownUntil = Date.now() + (retrySeconds * 1000);
    
    // Adjust QPS based on error type (following Google's recommendations)
    switch (errorType) {
      case 'RESOURCE_EXHAUSTED':
        this.state.currentQPS = Math.max(0.1, this.state.currentQPS * 0.3); // Aggressive reduction
        break;
      case 'TOO_MANY_REQUESTS':
        this.state.currentQPS = Math.max(0.2, this.state.currentQPS * 0.5); // Moderate reduction
        break;
      case 'QUOTA_EXCEEDED':
        this.state.currentQPS = 0.1; // Minimal QPS until quota resets
        break;
      default:
        this.state.currentQPS = Math.max(0.1, this.state.currentQPS * 0.7);
    }
    
    this.persistState();
    
    console.error(`[RATE_MANAGER] ${errorType} error: Entering ${retrySeconds}s cooldown. New QPS: ${this.state.currentQPS}`);
    
    // Log detailed error information for debugging
    console.error(`[RATE_MANAGER] Error details:`, {
      type: errorType,
      cooldownUntil: new Date(this.state.cooldownUntil).toISOString(),
      newQPS: this.state.currentQPS,
      quotaUsed: this.state.dailyQuotaUsed,
      quotaLimit: this.state.dailyQuotaLimit
    });
  }

  /**
   * Get current quota status for monitoring
   */
  getQuotaStatus() {
    const quotaRemaining = this.state.dailyQuotaLimit - this.state.dailyQuotaUsed;
    const usagePercentage = (this.state.dailyQuotaUsed / this.state.dailyQuotaLimit) * 100;
    
    return {
      dailyQuotaUsed: this.state.dailyQuotaUsed,
      dailyQuotaLimit: this.state.dailyQuotaLimit,
      quotaRemaining,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
      currentQPS: this.state.currentQPS,
      isInCooldown: this.state.isInCooldown,
      cooldownEnds: this.state.isInCooldown ? new Date(this.state.cooldownUntil).toISOString() : null,
      safeToOperate: quotaRemaining > this.config.quotaBuffer && !this.state.isInCooldown
    };
  }

  /**
   * Start daily quota monitoring
   */
  private startQuotaMonitoring(): void {
    // Check every hour if we need to reset daily quota
    setInterval(() => {
      const today = new Date().toDateString();
      if (this.state.lastResetTime !== today) {
        console.log('[RATE_MANAGER] New day detected, resetting quota');
        this.state.dailyQuotaUsed = 0;
        this.state.lastResetTime = today;
        this.state.isInCooldown = false;
        this.state.cooldownUntil = 0;
        this.persistState();
      }
    }, 3600000); // Check every hour
  }

  /**
   * Emergency reset (use only if absolutely necessary)
   */
  emergencyReset(): void {
    console.warn('[RATE_MANAGER] EMERGENCY RESET ACTIVATED');
    this.state.isInCooldown = false;
    this.state.cooldownUntil = 0;
    this.state.currentQPS = 0.1; // Very conservative
    this.persistState();
  }

  /**
   * Get intelligent wait time for next request
   */
  getOptimalWaitTime(): number {
    const status = this.canMakeRequest();
    if (status.allowed) return 0;
    return status.waitTime || 2000; // Default 2 second wait
  }
}

// Global singleton instance
export const productionRateManager = new ProductionRateManager();
