'use client';

import React from 'react';
import { Card, Row, Col, Typography, Space } from 'antd';
import { RocketOutlined, PictureOutlined } from '@ant-design/icons';
import { CampaignType } from './types';

const { Title, Text } = Typography;

interface CampaignTypeSelectorProps {
  selectedType?: CampaignType['id'];
  onSelect: (type: CampaignType['id']) => void;
}

const CampaignTypeSelector: React.FC<CampaignTypeSelectorProps> = ({
  selectedType,
  onSelect
}) => {
  const campaignTypes = [
    {
      id: 'PERFORMANCE_MAX' as const,
      name: 'Performance Max',
      description: 'Reach audiences across all of Google with a single campaign. Google\'s AI finds the best combinations of your assets.',
      icon: <RocketOutlined style={{ fontSize: '32px', color: '#1890ff' }} />,
      benefits: ['AI-powered optimization', 'All Google properties', 'Maximum reach'],
      recommended: true
    },
    {
      id: 'DISPLAY' as const,
      name: 'Display Network',
      description: 'Reach customers across millions of websites and apps with engaging visual ads.',
      icon: <PictureOutlined style={{ fontSize: '32px', color: '#52c41a' }} />,
      benefits: ['Visual storytelling', 'Broad reach', 'Brand awareness'],
      recommended: false
    }
  ];

  return (
    <div>
      <div className="mb-6">
        <Title level={3} className="mb-2">Select a campaign type</Title>
        <Text type="secondary" className="text-base">
          Choose the type that best fits your advertising goals
        </Text>
      </div>

      <Row gutter={24}>
        {campaignTypes.map((type) => (
          <Col span={12} key={type.id}>
            <Card
              hoverable
              className={`h-full cursor-pointer transition-all duration-200 ${
                selectedType === type.id 
                  ? 'border-blue-500 shadow-lg' 
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              onClick={() => onSelect(type.id)}
              bodyStyle={{ padding: '24px' }}
            >
              <div className="text-center mb-4">
                {type.icon}
                <div className="mt-3">
                  <Title level={4} className="mb-2 flex items-center justify-center gap-2">
                    {type.name}
                    {type.recommended && (
                      <span className="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-full">
                        Recommended
                      </span>
                    )}
                  </Title>
                </div>
              </div>

              <div className="mb-4">
                <Text className="text-gray-600 leading-relaxed">
                  {type.description}
                </Text>
              </div>

              <div>
                <Text strong className="block mb-2 text-sm">Key Benefits:</Text>
                <Space direction="vertical" size="small" className="w-full">
                  {type.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <Text className="text-sm text-gray-600">{benefit}</Text>
                    </div>
                  ))}
                </Space>
              </div>

              {selectedType === type.id && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <Text className="text-blue-700 text-sm font-medium">
                    ✓ Selected - Ready to configure
                  </Text>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {selectedType && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <Text className="text-green-700">
            <strong>Great choice!</strong> You've selected{' '}
            <strong>
              {campaignTypes.find(t => t.id === selectedType)?.name}
            </strong>
            . This campaign type is perfect for{' '}
            {selectedType === 'PERFORMANCE_MAX' 
              ? 'maximizing conversions across all Google properties with AI optimization'
              : 'building brand awareness and reaching customers across millions of websites'
            }.
          </Text>
        </div>
      )}
    </div>
  );
};

export default CampaignTypeSelector;


