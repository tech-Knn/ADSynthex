/**
 * DateRange Value Object
 * Immutable representation of a date range
 */

export class DateRange {
  constructor(
    public readonly start: Date,
    public readonly end: Date
  ) {
    this.validate();
  }

  /**
   * Validate date range
   */
  private validate(): void {
    if (!(this.start instanceof Date) || isNaN(this.start.getTime())) {
      throw new Error('Invalid start date');
    }

    if (!(this.end instanceof Date) || isNaN(this.end.getTime())) {
      throw new Error('Invalid end date');
    }

    if (this.start > this.end) {
      throw new Error('Start date must be before or equal to end date');
    }
  }

  /**
   * Get number of days in range
   */
  get days(): number {
    const diffTime = this.end.getTime() - this.start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both days
  }

  /**
   * Check if date range is today only
   */
  get isToday(): boolean {
    const today = new Date();
    return this.isSameDay(this.start, today) && this.isSameDay(this.end, today);
  }

  /**
   * Check if date range is a single day
   */
  get isSingleDay(): boolean {
    return this.isSameDay(this.start, this.end);
  }

  /**
   * Format for API calls (YYYY-MM-DD)
   */
  get startFormatted(): string {
    return this.formatDate(this.start);
  }

  get endFormatted(): string {
    return this.formatDate(this.end);
  }

  /**
   * Create from string dates
   */
  static fromStrings(startDate: string, endDate: string): DateRange {
    return new DateRange(new Date(startDate), new Date(endDate));
  }

  /**
   * Create for today
   */
  static today(): DateRange {
    const today = new Date();
    return new DateRange(today, today);
  }

  /**
   * Create for yesterday
   */
  static yesterday(): DateRange {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return new DateRange(yesterday, yesterday);
  }

  /**
   * Create for last N days
   */
  static lastNDays(days: number): DateRange {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    return new DateRange(start, end);
  }

  /**
   * Check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * String representation
   */
  toString(): string {
    return `${this.startFormatted} to ${this.endFormatted}`;
  }
}

