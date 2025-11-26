'use client';

import React, { useState } from 'react';
import { Card, Select, Typography, Space, Alert, Button, Input, InputNumber } from 'antd';
import { InfoCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { ConversionGoal } from './types';

const { Title, Text } = Typography;
const { Option } = Select;

interface ConversionGoalsSetupProps {
  selectedGoals: ConversionGoal[];
  onGoalsChange: (goals: ConversionGoal[]) => void;
  campaignObjective: string;
}

const ConversionGoalsSetup: React.FC<ConversionGoalsSetupProps> = ({
  selectedGoals,
  onGoalsChange,
  campaignObjective
}) => {
  const [showCustomGoal, setShowCustomGoal] = useState(false);

  const defaultGoals = [
    {
      id: 'outbound-clicks',
      name: 'Outbound clicks',
      type: 'OUTBOUND_CLICKS' as const,
      value: 0.05,
      currency: 'USD',
      status: 'RECORDING' as const,
      description: '1 active conversion action from Website for the Outbound clicks goal'
    },
    {
      id: 'purchase',
      name: 'Purchase',
      type: 'PURCHASE' as const,
      value: 25.00,
      currency: 'USD', 
      status: 'NOT_RECORDING' as const,
      description: 'Track completed purchases on your website'
    },
    {
      id: 'lead-form',
      name: 'Lead form submission',
      type: 'LEAD' as const,
      value: 15.00,
      currency: 'USD',
      status: 'NOT_RECORDING' as const,
      description: 'Track form submissions and lead generation'
    },
    {
      id: 'phone-call',
      name: 'Phone calls',
      type: 'PHONE_CALL' as const,
      value: 20.00,
      currency: 'USD',
      status: 'NOT_RECORDING' as const,
      description: 'Track phone calls from your ads'
    }
  ];

  const getRecommendedGoals = () => {
    switch (campaignObjective) {
      case 'SALES':
        return ['outbound-clicks', 'purchase'];
      case 'LEADS':
        return ['outbound-clicks', 'lead-form'];
      case 'WEBSITE_TRAFFIC':
        return ['outbound-clicks'];
      default:
        return ['outbound-clicks'];
    }
  };

  const handleGoalSelect = (goalId: string) => {
    const goal = defaultGoals.find(g => g.id === goalId);
    if (goal && !selectedGoals.find(g => g.id === goalId)) {
      onGoalsChange([...selectedGoals, goal]);
    }
  };

  const handleGoalRemove = (goalId: string) => {
    onGoalsChange(selectedGoals.filter(g => g.id !== goalId));
  };

  const handleGoalValueChange = (goalId: string, value: number) => {
    onGoalsChange(
      selectedGoals.map(goal =>
        goal.id === goalId ? { ...goal, value } : goal
      )
    );
  };

  const recommendedGoalIds = getRecommendedGoals();

  return (
    <div>
      <div className="mb-6">
        <Title level={3} className="mb-2">Use these conversion goals to improve {campaignObjective}</Title>
        <Text type="secondary" className="text-base">
          Review your goals for this campaign. We'll optimize your bidding to get you more of the conversions that matter to your business.
        </Text>
      </div>

      {/* Current Goals */}
      <Card title="Conversion goals" className="mb-4">
        <div className="space-y-4">
          {selectedGoals.length === 0 ? (
            <Alert
              message="No conversion goals selected"
              description="Add at least one conversion goal to measure campaign performance"
              type="warning"
              showIcon
            />
          ) : (
            selectedGoals.map((goal) => (
              <Card key={goal.id} size="small" className="bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <InfoCircleOutlined className="text-blue-600" />
                    </div>
                    <div>
                      <Text strong>{goal.name}</Text>
                      <br />
                      <Text className="text-sm text-gray-600">{goal.description}</Text>
                      <br />
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${
                          goal.status === 'RECORDING' ? 'bg-green-500' : 'bg-gray-400'
                        }`}></div>
                        <Text className="text-xs text-gray-500">
                          {goal.status === 'RECORDING' ? 'Recording conversions' : 'Not recording'}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          • Value: {goal.currency}{goal.value.toFixed(2)} avg
                        </Text>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <InputNumber
                      size="small"
                      value={goal.value}
                      onChange={(value) => handleGoalValueChange(goal.id, value || 0)}
                      addonBefore="$"
                      step={0.01}
                      min={0}
                      placeholder="Value"
                    />
                    <Button 
                      size="small" 
                      type="text" 
                      onClick={() => handleGoalRemove(goal.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </Card>

      {/* Add More Goals */}
      <Card title="Add conversion goals" className="mb-4">
        <div className="mb-4">
          <Text strong className="block mb-2">Recommended for {campaignObjective}:</Text>
          <Space wrap>
            {defaultGoals
              .filter(goal => 
                recommendedGoalIds.includes(goal.id) && 
                !selectedGoals.find(g => g.id === goal.id)
              )
              .map(goal => (
                <Button
                  key={goal.id}
                  type="dashed"
                  onClick={() => handleGoalSelect(goal.id)}
                  className="text-blue-600 border-blue-300"
                >
                  <PlusOutlined /> {goal.name}
                </Button>
              ))
            }
          </Space>
        </div>

        <div className="mb-4">
          <Text strong className="block mb-2">All available goals:</Text>
          <Select
            placeholder="Select a conversion goal to add"
            style={{ width: '100%' }}
            onSelect={handleGoalSelect}
            value={undefined}
          >
            {defaultGoals
              .filter(goal => !selectedGoals.find(g => g.id === goal.id))
              .map(goal => (
                <Option key={goal.id} value={goal.id}>
                  <div>
                    <Text>{goal.name}</Text>
                    <br />
                    <Text className="text-xs text-gray-500">{goal.description}</Text>
                  </div>
                </Option>
              ))
            }
          </Select>
        </div>

        <Button
          type="link"
          onClick={() => setShowCustomGoal(!showCustomGoal)}
          className="p-0"
        >
          <PlusOutlined /> Create custom conversion goal
        </Button>

        {showCustomGoal && (
          <Card size="small" className="mt-3 bg-blue-50">
            <Text className="text-sm text-blue-700">
              Custom conversion goal creation will be available in advanced settings.
              For now, you can use the predefined goals that match most business needs.
            </Text>
          </Card>
        )}
      </Card>

      {selectedGoals.length > 0 && (
        <Alert
          message="Dynamic value tracking enabled"
          description={`A unique value is recorded for each conversion. The average value recorded for these conversions is $${(selectedGoals.reduce((sum, goal) => sum + goal.value, 0) / selectedGoals.length).toFixed(2)} avg.`}
          type="info"
          showIcon
          className="mb-4"
        />
      )}
    </div>
  );
};

export default ConversionGoalsSetup;


