'use client';

import React, { useState } from 'react';
import { Typography, Steps, Button, Space, Card } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import CampaignTypeSelector from './CampaignTypeSelector';
import CampaignObjectiveSelector from './CampaignObjectiveSelector';
import ConversionGoalsSetup from './ConversionGoalsSetup';
import { GoogleAdsCampaign, CampaignType, CampaignObjective, ConversionGoal } from './types';

const { Title, Text } = Typography;
const { Step } = Steps;

const GoogleAdsLauncher: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [campaignData, setCampaignData] = useState<Partial<GoogleAdsCampaign>>({});

  const steps = [
    { title: 'Campaign Type', description: 'Choose your campaign approach' },
    { title: 'Objectives', description: 'Define your goals' },
    { title: 'Conversions', description: 'Set up tracking' },
    { title: 'Settings', description: 'Location & budget' },
    { title: 'Creative', description: 'Ads & media' },
    { title: 'Launch', description: 'Review & publish' }
  ];

  const handleCampaignTypeSelect = (type: CampaignType['id']) => {
    setCampaignData(prev => ({ ...prev, type }));
  };

  const handleObjectiveSelect = (objective: CampaignObjective['id']) => {
    setCampaignData(prev => ({ ...prev, objective }));
  };

  const handleConversionGoalsChange = (goals: ConversionGoal[]) => {
    setCampaignData(prev => ({ ...prev, conversionGoals: goals }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return !!campaignData.type;
      case 1: return !!campaignData.objective;
      case 2: return campaignData.conversionGoals && campaignData.conversionGoals.length > 0;
      default: return true;
    }
  };

  const nextStep = () => {
    if (canProceed() && currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <CampaignTypeSelector
            selectedType={campaignData.type}
            onSelect={handleCampaignTypeSelect}
          />
        );
      
      case 1:
        return campaignData.type ? (
          <CampaignObjectiveSelector
            selectedObjective={campaignData.objective}
            onSelect={handleObjectiveSelect}
            campaignType={campaignData.type}
          />
        ) : (
          <div className="text-center py-8">
            <Text type="secondary">Please select a campaign type first.</Text>
          </div>
        );
      
      case 2:
        return campaignData.objective ? (
          <ConversionGoalsSetup
            selectedGoals={campaignData.conversionGoals || []}
            onGoalsChange={handleConversionGoalsChange}
            campaignObjective={campaignData.objective}
          />
        ) : (
          <div className="text-center py-8">
            <Text type="secondary">Please select a campaign objective first.</Text>
          </div>
        );
      
      default:
        return (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-blue-600 text-2xl">🚧</span>
            </div>
            <Title level={4} className="mb-2">Coming Soon</Title>
            <Text type="secondary">
              This step will be implemented in the next phase of development.
            </Text>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded mr-3 flex items-center justify-center">
                <span className="text-white text-sm font-bold">G</span>
              </div>
              <span className="text-xl font-normal text-gray-800">Google Ads</span>
              <span className="ml-4 text-sm text-gray-500">Campaign Creation</span>
            </div>
            <Text type="secondary">
              Step {currentStep + 1} of {steps.length}
            </Text>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Steps 
            current={currentStep} 
            size="small"
            className="max-w-4xl mx-auto"
          >
            {steps.map((step, index) => (
              <Step 
                key={index}
                title={step.title}
                description={step.description}
              />
            ))}
          </Steps>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Card className="shadow-sm border-0">
          <div className="min-h-[500px]">
            {renderStepContent()}
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <Button 
            size="large"
            onClick={prevStep}
            disabled={currentStep === 0}
            icon={<ArrowLeftOutlined />}
          >
            Back
          </Button>

          <Space>
            <Text type="secondary">
              {currentStep + 1} of {steps.length} steps completed
            </Text>
            <Button 
              type="primary"
              size="large"
              onClick={nextStep}
              disabled={!canProceed() || currentStep >= steps.length - 1}
              icon={<ArrowRightOutlined />}
            >
              {currentStep === steps.length - 1 ? 'Launch Campaign' : 'Continue'}
            </Button>
          </Space>
        </div>

        {/* Debug Info (Development only) */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="mt-8 bg-gray-50" size="small">
            <Text strong className="block mb-2">Campaign Data (Dev Mode):</Text>
            <pre className="text-xs text-gray-600">
              {JSON.stringify(campaignData, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  );
};

export default GoogleAdsLauncher;
