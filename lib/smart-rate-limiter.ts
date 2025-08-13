/**
 * Intelligent Rate Limiter for Google Ads API
 * Dynamically adjusts QPS based on API response patterns and error rates
 */

interface SmartRateLimiterConfig {
  baseQPS: number;
  maxQPS: number;
  adaptiveMode: boolean;
  burstAllowance: number;
  cooldownMultiplier: number;
}

interface RateLimitState {
  currentQPS: number;
  requestTimes: number[];
  errorCount: number;
  successCount: number;
  lastErrorTime: number;
  adaptiveWindow: number[];
}

export class SmartRateLimiter {
  private config: SmartRateLimiterConfig;
  private state: RateLimitState;
  private requestQueue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    priority: number;
    accountId?: string;
  }> = [];
  private isProcessing = false;

  constructor(config: Partial<SmartRateLimiterConfig> = {}) {
    this.config = {
      baseQPS: 2,           // Start conservative
      maxQPS: 5,            // Google Ads API typical limit
      adaptiveMode: true,   // Enable smart adaptation
      burstAllowance: 3,    // Allow 3 requests in burst
      cooldownMultiplier: 2, // Backoff multiplier
      ...config
    };

    this.state = {
      currentQPS: this.config.baseQPS,
      requestTimes: [],
      errorCount: 0,
      successCount: 0,
      lastErrorTime: 0,
      adaptiveWindow: []
    };
  }

  /**
   * Add request to the intelligent queue
   */
  async executeRequest<T>(
    requestFn: () => Promise<T>,
    options: {
      priority?: number;
      accountId?: string;
      timeout?: number;
    } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        fn: requestFn,
        resolve,
        reject,
        priority: options.priority || 1,
        accountId: options.accountId
      });

      // Sort queue by priority (higher priority first)
      this.requestQueue.sort((a, b) => b.priority - a.priority);

      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process request queue with intelligent spacing
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`[SMART_LIMITER] Processing queue: ${this.requestQueue.length} requests, current QPS: ${this.state.currentQPS}`);

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!;
      
      try {
        // Wait for rate limit compliance
        await this.waitForRateLimit();
        
        // Record request timing
        const startTime = Date.now();
        this.recordRequest();
        
        // Execute the request
        const result = await request.fn();
        
        // Record success and adapt QPS
        this.recordSuccess(Date.now() - startTime);
        request.resolve(result);
        
      } catch (error) {
        console.error(`[SMART_LIMITER] Request failed:`, error);
        
        // Record error and adapt QPS
        this.recordError();
        
        // Check if this is a rate limit error
        if (this.isRateLimitError(error)) {
          // Requeue with lower priority
          this.requestQueue.unshift({
            ...request,
            priority: Math.max(0, request.priority - 1)
          });
          
          // Implement cooldown
          await this.applyCooldown();
          continue;
        }
        
        request.reject(error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Wait for rate limit compliance
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = 1000; // 1 second window
    
    // Clean old requests
    this.state.requestTimes = this.state.requestTimes.filter(
      time => now - time < windowMs
    );
    
    // Check if we need to wait
    if (this.state.requestTimes.length >= this.state.currentQPS) {
      const oldestRequest = Math.min(...this.state.requestTimes);
      const waitTime = oldestRequest + windowMs - now;
      
      if (waitTime > 0) {
        console.log(`[SMART_LIMITER] Waiting ${waitTime}ms for rate limit compliance`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Record successful request and adapt QPS
   */
  private recordSuccess(responseTime: number): void {
    this.state.successCount++;
    this.state.adaptiveWindow.push(responseTime);
    
    // Keep only last 10 responses for adaptive window
    if (this.state.adaptiveWindow.length > 10) {
      this.state.adaptiveWindow.shift();
    }
    
    // Adaptive QPS increase if we're doing well
    if (this.config.adaptiveMode && this.state.successCount % 5 === 0) {
      const avgResponseTime = this.state.adaptiveWindow.reduce((a, b) => a + b, 0) / this.state.adaptiveWindow.length;
      
      // If average response time is low, we can increase QPS
      if (avgResponseTime < 1000 && this.state.currentQPS < this.config.maxQPS) {
        this.state.currentQPS = Math.min(this.config.maxQPS, this.state.currentQPS + 0.5);
        console.log(`[SMART_LIMITER] Increased QPS to ${this.state.currentQPS} (good performance)`);
      }
    }
  }

  /**
   * Record error and adapt QPS
   */
  private recordError(): void {
    this.state.errorCount++;
    this.state.lastErrorTime = Date.now();
    
    // Adaptive QPS decrease on errors
    if (this.config.adaptiveMode) {
      this.state.currentQPS = Math.max(1, this.state.currentQPS * 0.7);
      console.log(`[SMART_LIMITER] Decreased QPS to ${this.state.currentQPS} due to error`);
    }
  }

  /**
   * Record request timing
   */
  private recordRequest(): void {
    this.state.requestTimes.push(Date.now());
  }

  /**
   * Check if error is rate limit related
   */
  private isRateLimitError(error: any): boolean {
    const errorStr = JSON.stringify(error).toLowerCase();
    return errorStr.includes('rate') || 
           errorStr.includes('429') || 
           errorStr.includes('resource_exhausted') ||
           errorStr.includes('too many requests');
  }

  /**
   * Apply cooldown after rate limit error
   */
  private async applyCooldown(): Promise<void> {
    const cooldownTime = this.config.cooldownMultiplier * 1000;
    console.log(`[SMART_LIMITER] Applying ${cooldownTime}ms cooldown after rate limit`);
    await new Promise(resolve => setTimeout(resolve, cooldownTime));
    
    // Reset QPS to base level after cooldown
    this.state.currentQPS = this.config.baseQPS;
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      currentQPS: this.state.currentQPS,
      queueLength: this.requestQueue.length,
      successCount: this.state.successCount,
      errorCount: this.state.errorCount,
      errorRate: this.state.successCount > 0 ? this.state.errorCount / (this.state.successCount + this.state.errorCount) : 0
    };
  }
}

// Global instance
export const smartRateLimiter = new SmartRateLimiter();

