/**
 * Dependency Injection Container
 * Simple factory pattern for now (can be upgraded to InversifyJS later)
 */

import { GoogleAdsClient } from '../clients/GoogleAdsClient';
import { AdsComClient } from '../clients/AdsComClient';
import { CacheProvider } from '../cache/CacheProvider';
import { getGoogleAdsConfig } from '../config/GoogleAdsConfig';
import { DataMatcher } from '../../domain/services/DataMatcher';
import { MetricsCalculator } from '../../domain/services/MetricsCalculator';

/**
 * Simple DI Container
 */
class Container {
  private instances: Map<string, any> = new Map();

  /**
   * Get or create GoogleAdsClient
   */
  getGoogleAdsClient(): GoogleAdsClient {
    if (!this.instances.has('GoogleAdsClient')) {
      const config = getGoogleAdsConfig();
      this.instances.set('GoogleAdsClient', new GoogleAdsClient(config));
    }
    return this.instances.get('GoogleAdsClient');
  }

  /**
   * Get or create AdsComClient
   */
  getAdsComClient(): AdsComClient {
    if (!this.instances.has('AdsComClient')) {
      this.instances.set('AdsComClient', new AdsComClient());
    }
    return this.instances.get('AdsComClient');
  }

  /**
   * Get or create CacheProvider
   */
  getCacheProvider(): CacheProvider {
    if (!this.instances.has('CacheProvider')) {
      this.instances.set('CacheProvider', new CacheProvider());
    }
    return this.instances.get('CacheProvider');
  }

  /**
   * Get or create DataMatcher
   */
  getDataMatcher(): DataMatcher {
    if (!this.instances.has('DataMatcher')) {
      this.instances.set('DataMatcher', new DataMatcher());
    }
    return this.instances.get('DataMatcher');
  }

  /**
   * Get or create MetricsCalculator
   */
  getMetricsCalculator(): MetricsCalculator {
    if (!this.instances.has('MetricsCalculator')) {
      this.instances.set('MetricsCalculator', new MetricsCalculator());
    }
    return this.instances.get('MetricsCalculator');
  }

  /**
   * Clear all instances (useful for testing)
   */
  clear(): void {
    this.instances.clear();
  }
}

// Singleton container
export const container = new Container();

