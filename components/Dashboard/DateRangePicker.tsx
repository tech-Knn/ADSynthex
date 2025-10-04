import React from 'react';
import { DatePicker, Button, Space, Card } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface DateRangePickerProps {
  onDateRangeChange: (startDate: string, endDate: string) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ onDateRangeChange }) => {
  const [dateRange, setDateRange] = React.useState<[Dayjs, Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs()
  ]);

  // Handle date range change
  const handleRangeChange = (dates: [Dayjs, Dayjs]) => {
    if (dates && dates.length === 2) {
      setDateRange(dates);
    }
  };

  // Apply date range filter
  const handleApply = () => {
    if (dateRange && dateRange.length === 2) {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      onDateRangeChange(startDate, endDate);
    }
  };

  // Predefined ranges
  const handleQuickSelect = (days: number) => {
    const end = dayjs();
    const start = dayjs().subtract(days, 'day');
    setDateRange([start, end]);
    onDateRangeChange(start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'));
  };

  return (
    <Card title="Date Range">
      <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => handleRangeChange(dates as [Dayjs, Dayjs])}
          allowClear={false}
        />
        <Space>
          <Button onClick={() => handleQuickSelect(7)}>Last 7 Days</Button>
          <Button onClick={() => handleQuickSelect(30)}>Last 30 Days</Button>
          <Button onClick={() => handleQuickSelect(90)}>Last 90 Days</Button>
          <Button type="primary" onClick={handleApply}>Apply</Button>
        </Space>
      </Space>
    </Card>
  );
};

export default DateRangePicker; 