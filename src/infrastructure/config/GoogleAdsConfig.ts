/**
 * Google Ads Configuration
 * Loads and validates environment variables
 */

export class GoogleAdsConfig {
  public readonly clientId: string;
  public readonly clientSecret: string;
  public readonly developerToken: string;
  public readonly refreshToken: string;
  public readonly managerId: string;

  constructor() {
    this.clientId = this.getEnvVar('GOOGLE_ADS_CLIENT_ID');
    this.clientSecret = this.getEnvVar('GOOGLE_ADS_CLIENT_SECRET');
    this.developerToken = this.getEnvVar('GOOGLE_ADS_DEVELOPER_TOKEN');
    this.refreshToken = this.getEnvVar('GOOGLE_ADS_REFRESH_TOKEN');
    this.managerId = this.getEnvVar('GOOGLE_ADS_MANAGER_ID');
  }

  private getEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }

  public validate(): void {
    const required = [
      'clientId',
      'clientSecret',
      'developerToken',
      'refreshToken',
      'managerId'
    ];

    for (const field of required) {
      if (!(this as any)[field]) {
        throw new Error(`Google Ads configuration missing: ${field}`);
      }
    }
  }
}

// Singleton instance
let configInstance: GoogleAdsConfig | null = null;

export function getGoogleAdsConfig(): GoogleAdsConfig {
  if (!configInstance) {
    configInstance = new GoogleAdsConfig();
    configInstance.validate();
  }
  return configInstance;
}

