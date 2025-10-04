import React, { useMemo } from 'react';
import { Card, Alert } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';

interface DataCompletenessProps {
  data: any[];
}

const DataCompleteness: React.FC<DataCompletenessProps> = ({ data }) => {
  const completenessInfo = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        total: 0,
        naCount: 0,
        percentage: 0
      };
    }

    // Count entries with N/A country
    const naEntries = data.filter(item => 
      item.country === 'N/A' || 
      item.country === 'n/a' || 
      item.country === 'NA' || 
      item.country === '' ||
      item.country?.includes('N/A')
    );

    return {
      total: data.length,
      naCount: naEntries.length,
      percentage: (naEntries.length / data.length) * 100
    };
  }, [data]);

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <Card 
      style={{ 
        marginBottom: 24,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}
    >
      <Alert
        icon={<GlobalOutlined />}
        message="Data Completeness"
        description={
          <span>
            {completenessInfo.naCount} of {completenessInfo.total} entries show as "N/A" country - 
            this represents data without country information that has been preserved to maintain accurate totals.
          </span>
        }
        type="info"
        showIcon
      />
    </Card>
  );
};

export default DataCompleteness; 