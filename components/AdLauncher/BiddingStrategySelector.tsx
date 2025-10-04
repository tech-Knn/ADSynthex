'use client';

import React from 'react';
import { Select, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const { Option } = Select;

export const BIDDING_STRATEGIES = [
  {
    value: 'MAXIMIZE_CLICKS',
    label: 'Maximize Clicks',
    description: 'Automatically sets bids to help get as many clicks as possible within your budget',
    suitable: ['SEARCH', 'DISPLAY']
  },
  {
    value: 'MAXIMIZE_CONVERSIONS',
    label: 'Maximize Conversions',
    description: 'Automatically sets bids to help get the most conversions for your campaign within your budget',
    suitable: ['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX']
  },
  {
    value: 'TARGET_CPA',
    label: 'Target CPA',
    description: 'Sets bids to help get as many conversions as possible at the target cost-per-acquisition you set',
    suitable: ['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX']
  },
  {
    value: 'TARGET_ROAS',
    label: 'Target ROAS',
    description: 'Sets bids to help get as much conversion value as possible at the target return on ad spend you set',
    suitable: ['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX']
  },
  {
    value: 'MANUAL_CPC',
    label: 'Manual CPC',
    description: 'You manage your maximum CPC bids yourself. You can set different bids for different ad groups or keywords',
    suitable: ['SEARCH', 'DISPLAY']
  },
  {
    value: 'ENHANCED_CPC',
    label: 'Enhanced CPC',
    description: 'Automatically adjusts your manual bids to try to maximize conversions',
    suitable: ['SEARCH', 'DISPLAY']
  },
  {
    value: 'MAXIMIZE_CONVERSION_VALUE',
    label: 'Maximize Conversion Value',
    description: 'Automatically sets bids to maximize the total conversion value within your budget',
    suitable: ['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX']
  }
];

interface BiddingStrategySelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  campaignType?: string;
  placeholder?: string;
}

const BiddingStrategySelector: React.FC<BiddingStrategySelectorProps> = ({ 
  value, 
  onChange, 
  campaignType = 'SEARCH',
  placeholder = "Select bidding strategy" 
}) => {
  const availableStrategies = BIDDING_STRATEGIES.filter(
    strategy => strategy.suitable.includes(campaignType)
  );

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%' }}
    >
      {availableStrategies.map((strategy) => (
        <Option key={strategy.value} value={strategy.value}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{strategy.label}</span>
            <Tooltip title={strategy.description}>
              <InfoCircleOutlined style={{ marginLeft: 8, color: '#1890ff' }} />
            </Tooltip>
          </div>
        </Option>
      ))}
    </Select>
  );
};

export default BiddingStrategySelector;




