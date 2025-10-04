'use client';

import React from 'react';
import { Card, Row, Col, Typography, Space } from 'antd';
import { 
  ShoppingOutlined, TeamOutlined, GlobalOutlined, MobileOutlined,
  SoundOutlined, EnvironmentOutlined, SettingOutlined 
} from '@ant-design/icons';
import { CampaignObjective } from './types';

const { Title, Text } = Typography;

interface CampaignObjectiveSelectorProps {
  selectedObjective?: CampaignObjective['id'];
  onSelect: (objective: CampaignObjective['id']) => void;
  campaignType: 'PERFORMANCE_MAX' | 'DISPLAY';
}

const CampaignObjectiveSelector: React.FC<CampaignObjectiveSelectorProps> = ({
  selectedObjective,
  onSelect,
  campaignType
}) => {
  const objectives = [
    {
      id: 'SALES' as const,
      name: 'Sales',
      description: 'Drive sales online, in app, by phone or in store',
      icon: <ShoppingOutlined style={{ fontSize: '24px', color: '#52c41a' }} />,
      bestFor: campaignType === 'PERFORMANCE_MAX' ? 'E-commerce & online sales' : 'Product promotion'
    },
    {
      id: 'LEADS' as const,
      name: 'Leads',
      description: 'Get leads and other conversions by encouraging customers to take action',
      icon: <TeamOutlined style={{ fontSize: '24px', color: '#1890ff' }} />,
      bestFor: 'Lead generation & sign-ups',
      recommended: true
    },
    {
      id: 'WEBSITE_TRAFFIC' as const,
      name: 'Website traffic',
      description: 'Get the right people to visit your website',
      icon: <GlobalOutlined style={{ fontSize: '24px', color: '#722ed1' }} />,
      bestFor: 'Content marketing & engagement'
    },
    {
      id: 'APP_PROMOTION' as const,
      name: 'App promotion',
      description: 'Get more installs, engagement and pre-registration for your app',
      icon: <MobileOutlined style={{ fontSize: '24px', color: '#fa8c16' }} />,
      bestFor: 'Mobile app marketing'
    },
    {
      id: 'AWARENESS' as const,
      name: 'Awareness and consideration',
      description: 'Reach a broad audience and build interest in your products or brand',
      icon: <SoundOutlined style={{ fontSize: '24px', color: '#eb2f96' }} />,
      bestFor: 'Brand building & awareness'
    },
    {
      id: 'LOCAL_VISITS' as const,
      name: 'Local shop visits and promotions',
      description: 'Drive visits to local shops, including restaurants and dealerships.',
      icon: <EnvironmentOutlined style={{ fontSize: '24px', color: '#13c2c2' }} />,
      bestFor: 'Local businesses'
    }
  ];

  return (
    <div>
      <div className="mb-6">
        <Title level={3} className="mb-2">What's your campaign objective?</Title>
        <Text type="secondary" className="text-base">
          Select an objective to tailor your experience to the goals and settings that will work best for your{' '}
          <strong>{campaignType === 'PERFORMANCE_MAX' ? 'Performance Max' : 'Display'}</strong> campaign
        </Text>
      </div>

      <Row gutter={[16, 16]}>
        {objectives.map((objective) => (
          <Col span={8} key={objective.id}>
            <Card
              hoverable
              className={`h-full cursor-pointer transition-all duration-200 ${
                selectedObjective === objective.id 
                  ? 'border-blue-500 shadow-lg bg-blue-50' 
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              onClick={() => onSelect(objective.id)}
              bodyStyle={{ padding: '20px' }}
            >
              <div className="mb-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1">{objective.icon}</div>
                  <div className="flex-1">
                    <Title level={5} className="mb-1 flex items-center gap-2">
                      {objective.name}
                      {objective.recommended && (
                        <span className="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-full">
                          Popular
                        </span>
                      )}
                    </Title>
                    <Text className="text-gray-600 text-sm leading-relaxed">
                      {objective.description}
                    </Text>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <Text className="text-xs text-gray-500 font-medium">
                  BEST FOR: {objective.bestFor}
                </Text>
              </div>

              {selectedObjective === objective.id && (
                <div className="mt-3 p-2 bg-blue-100 rounded border border-blue-300">
                  <Text className="text-blue-700 text-xs font-medium">
                    ✓ Selected Objective
                  </Text>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {selectedObjective && (
        <div className="mt-6">
          <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
            <Space>
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <Text strong className="text-green-700">
                  Perfect! Your {campaignType === 'PERFORMANCE_MAX' ? 'Performance Max' : 'Display'} campaign 
                  will be optimized for "{objectives.find(o => o.id === selectedObjective)?.name}".
                </Text>
                <br />
                <Text className="text-green-600">
                  We'll configure the best settings and targeting options for this objective.
                </Text>
              </div>
            </Space>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CampaignObjectiveSelector;


