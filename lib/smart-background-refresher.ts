/**
 * Smart Background Refresh System
 * Intelligently refreshes data based on user patterns and data importance
 */

import { fetchGoogleAdsData } from './google-ads-api';
import { unifiedCache } from './unified-cache-manager';
import { smartRateLimiter } from './smart-rate-limiter';

interface RefreshJob {
  id: string;
  accountId: string | null;
  startDate: string;
  endDate: string;
  priority: number;
  attempts: number;
  lastAttempt: number;
  scheduledFor: number;
  userRequested: boolean;
}

interface UserPattern {
  accountId: string | null;
  dateRanges: string[];
  frequency: number;
  lastAccessed: number;
}

export class SmartBackgroundRefresher {
  private jobs: Map<string, RefreshJob> = new Map();
  private userPatterns: Map<string, UserPattern> = new Map();
  private isProcessing = false;
  private maxConcurrentJobs = 2;
  private activeJobs = new Set<string>();

  constructor() {
    // Start the background processor
    this.startProcessor();
    
    // Schedule pattern analysis
    setInterval(() => this.analyzeUserPatterns(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Track user access patterns
   */
  trackUserAccess(accountId: string | null, startDate: string, endDate: string): void {
    const key = accountId || 'all';
    const dateRange = `${startDate}:${endDate}`;
    
    const pattern = this.userPatterns.get(key) || {
      accountId,
      dateRanges: [],
      frequency: 0,
      lastAccessed: 0
    };

    pattern.frequency++;
    pattern.lastAccessed = Date.now();
    
    // Track unique date ranges
    if (!pattern.dateRanges.includes(dateRange)) {
      pattern.dateRanges.push(dateRange);
      
      // Keep only last 10 date ranges
      if (pattern.dateRanges.length > 10) {
        pattern.dateRanges.shift();
      }
    }

    this.userPatterns.set(key, pattern);
    console.log(`[SMART_REFRESH] Tracked access: ${key}, frequency: ${pattern.frequency}`);
  }

  /**
   * Schedule background refresh with intelligent prioritization
   */
  scheduleRefresh(
    accountId: string | null,
    startDate: string,
    endDate: string,
    options: {
      priority?: number;
      userRequested?: boolean;
      delayMs?: number;
    } = {}
  ): void {
    const jobId = this.generateJobId(accountId, startDate, endDate);
    const existingJob = this.jobs.get(jobId);
    
    // Don't schedule if already fresh
    const cacheStatus = unifiedCache.shouldRefresh(startDate, endDate, accountId);
    if (!cacheStatus.shouldRefresh && !cacheStatus.backgroundRefresh) {
      console.log(`[SMART_REFRESH] Skipping refresh for ${jobId} - data is fresh`);
      return;
    }

    const priority = this.calculatePriority(accountId, startDate, endDate, options.priority);
    const scheduledFor = Date.now() + (options.delayMs || this.calculateDelay(priority));
    
    const job: RefreshJob = {
      id: jobId,
      accountId,
      startDate,
      endDate,
      priority,
      attempts: existingJob?.attempts || 0,
      lastAttempt: 0,
      scheduledFor,
      userRequested: options.userRequested || false
    };

    this.jobs.set(jobId, job);
    console.log(`[SMART_REFRESH] Scheduled ${jobId} with priority ${priority} for ${new Date(scheduledFor).toISOString()}`);
  }

  /**
   * Calculate intelligent priority based on user patterns and data characteristics
   */
  private calculatePriority(
    accountId: string | null,
    startDate: string,
    endDate: string,
    basePriority?: number
  ): number {
    if (basePriority) return basePriority;

    let priority = 5; // Base priority

    // User pattern analysis
    const pattern = this.userPatterns.get(accountId || 'all');
    if (pattern) {
      // High frequency access = higher priority
      if (pattern.frequency > 10) priority += 3;
      else if (pattern.frequency > 5) priority += 2;
      else if (pattern.frequency > 2) priority += 1;

      // Recent access = higher priority
      const timeSinceAccess = Date.now() - pattern.lastAccessed;
      if (timeSinceAccess < 60 * 1000) priority += 4; // Last minute
      else if (timeSinceAccess < 5 * 60 * 1000) priority += 2; // Last 5 minutes
      else if (timeSinceAccess < 15 * 60 * 1000) priority += 1; // Last 15 minutes
    }

    // Date range analysis
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (startDate === today && endDate === today) {
      priority += 5; // Today's data is highest priority
    } else if (startDate === yesterday && endDate === yesterday) {
      priority += 3; // Yesterday's data is high priority
    } else if (endDate === today || endDate === yesterday) {
      priority += 2; // Any range ending in recent days
    }

    // Account type priority
    if (accountId === null || accountId === 'all') {
      priority += 2; // Aggregated data used by many users
    }

    return Math.min(priority, 15); // Cap at 15
  }

  /**
   * Calculate delay based on priority
   */
  private calculateDelay(priority: number): number {
    // Higher priority = shorter delay
    const baseDelay = 30000; // 30 seconds
    const priorityMultiplier = Math.max(0.1, (15 - priority) / 15);
    return Math.round(baseDelay * priorityMultiplier);
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(accountId: string | null, startDate: string, endDate: string): string {
    return `refresh:${accountId || 'all'}:${startDate}:${endDate}`;
  }

  /**
   * Start the background processor
   */
  private startProcessor(): void {
    setInterval(async () => {
      if (!this.isProcessing) {
        await this.processJobs();
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    if (this.isProcessing || this.activeJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    this.isProcessing = true;
    const now = Date.now();

    try {
      // Get jobs ready for processing, sorted by priority
      const readyJobs = Array.from(this.jobs.values())
        .filter(job => 
          job.scheduledFor <= now && 
          !this.activeJobs.has(job.id) &&
          job.attempts < 3
        )
        .sort((a, b) => b.priority - a.priority)
        .slice(0, this.maxConcurrentJobs - this.activeJobs.size);

      if (readyJobs.length === 0) {
        return;
      }

      console.log(`[SMART_REFRESH] Processing ${readyJobs.length} jobs`);

      // Process jobs concurrently
      const jobPromises = readyJobs.map(job => this.processJob(job));
      await Promise.allSettled(jobPromises);

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual job
   */
  private async processJob(job: RefreshJob): Promise<void> {
    this.activeJobs.add(job.id);
    job.attempts++;
    job.lastAttempt = Date.now();

    console.log(`[SMART_REFRESH] Processing job ${job.id} (attempt ${job.attempts})`);

    try {
      // Use smart rate limiter to execute the request
      const freshData = await smartRateLimiter.executeRequest(
        () => fetchGoogleAdsData(job.startDate, job.endDate),
        {
          priority: job.priority,
          accountId: job.accountId || undefined
        }
      );

      if (freshData && freshData.ads) {
        // Store in unified cache
        unifiedCache.set(
          job.startDate,
          job.endDate,
          job.accountId,
          freshData,
          {
            dataType: job.accountId ? 'individual' : 'aggregated',
            priority: Math.ceil(job.priority / 5) // Convert to 1-3 scale
          }
        );

        console.log(`[SMART_REFRESH] Successfully refreshed ${job.id}`);
        
        // Remove job on success
        this.jobs.delete(job.id);
      } else {
        throw new Error('Invalid data received from API');
      }

    } catch (error) {
      console.error(`[SMART_REFRESH] Job ${job.id} failed (attempt ${job.attempts}):`, error);

      if (job.attempts >= 3) {
        console.error(`[SMART_REFRESH] Job ${job.id} failed permanently after 3 attempts`);
        this.jobs.delete(job.id);
      } else {
        // Reschedule with exponential backoff
        const backoffDelay = Math.pow(2, job.attempts) * 60000; // 1, 2, 4 minutes
        job.scheduledFor = Date.now() + backoffDelay;
        job.priority = Math.max(1, job.priority - 1); // Reduce priority on failure
        
        console.log(`[SMART_REFRESH] Rescheduled ${job.id} for ${new Date(job.scheduledFor).toISOString()}`);
      }
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Analyze user patterns and schedule proactive refreshes
   */
  private analyzeUserPatterns(): void {
    console.log(`[SMART_REFRESH] Analyzing user patterns for ${this.userPatterns.size} accounts`);

    for (const [accountKey, pattern] of this.userPatterns.entries()) {
      // Schedule proactive refresh for frequently accessed data
      if (pattern.frequency > 5 && Date.now() - pattern.lastAccessed < 30 * 60 * 1000) {
        
        // Get the most recent date ranges
        const recentRanges = pattern.dateRanges.slice(-3);
        
        for (const range of recentRanges) {
          const [startDate, endDate] = range.split(':');
          
          const cacheStatus = unifiedCache.shouldRefresh(startDate, endDate, pattern.accountId);
          if (cacheStatus.backgroundRefresh) {
            this.scheduleRefresh(pattern.accountId, startDate, endDate, {
              priority: 3, // Medium priority for proactive refresh
              delayMs: 5 * 60 * 1000 // 5 minute delay
            });
          }
        }
      }
    }
  }

  /**
   * Get refresh statistics
   */
  getStats() {
    const pendingJobs = Array.from(this.jobs.values());
    const highPriorityJobs = pendingJobs.filter(job => job.priority > 10).length;
    const failedJobs = pendingJobs.filter(job => job.attempts > 0).length;

    return {
      pendingJobs: pendingJobs.length,
      activeJobs: this.activeJobs.size,
      highPriorityJobs,
      failedJobs,
      trackedPatterns: this.userPatterns.size,
      rateLimiterStats: smartRateLimiter.getStats()
    };
  }

  /**
   * Force refresh for debugging
   */
  forceRefresh(accountId: string | null, startDate: string, endDate: string): void {
    this.scheduleRefresh(accountId, startDate, endDate, {
      priority: 15,
      userRequested: true,
      delayMs: 1000 // 1 second delay
    });
  }
}

// Global instance
export const smartBackgroundRefresher = new SmartBackgroundRefresher();

