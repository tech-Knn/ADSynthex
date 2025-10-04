'use client';

import React, { useState } from 'react';
import { 
  Typography, 
  Card, 
  Form,
  Input,
  Select, 
  Button, 
  Space, 
  Row, 
  Col,
  DatePicker,
  InputNumber,
  Upload,
  Switch,
  Checkbox,
  Radio,
  Divider,
  Alert,
  Tag,
  Collapse,
  Steps,
  message
} from 'antd';
import { 
  RocketOutlined,
  DollarOutlined,
  GlobalOutlined,
  CalendarOutlined,
  BulbOutlined,
  PictureOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  UploadOutlined,
  PlusOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;
const { Panel } = Collapse;
const { Step } = Steps;

interface CampaignFormData {
  // Step 1: Campaign Type & Objective
  campaignType: 'PERFORMANCE_MAX' | 'DISPLAY' | 'SEARCH';
  objective: 'SALES' | 'LEADS' | 'WEBSITE_TRAFFIC' | 'BRAND_AWARENESS';
  
  // Step 2: Campaign Name & Settings
  campaignName: string;
  campaignStatus: 'ENABLED' | 'PAUSED';
  
  // Step 3: Budget & Bidding
  budgetType: 'DAILY' | 'CAMPAIGN_TOTAL';
  budgetAmount: number;
  biddingStrategy: 'MAXIMIZE_CLICKS' | 'MAXIMIZE_CONVERSIONS' | 'TARGET_CPA' | 'TARGET_ROAS' | 'MANUAL_CPC';
  targetCpa?: number;
  targetRoas?: number;
  
  // Step 4: Location Targeting
  locations: string[];
  locationIntent: 'PRESENCE' | 'INTEREST' | 'PRESENCE_OR_INTEREST';
  excludedLocations: string[];
  
  // Step 5: Language Targeting
  languages: string[];
  
  // Step 6: Audience Targeting
  audiences: string[];
  demographics: {
    ageRanges: string[];
    genders: string[];
    parentalStatus: string[];
  };
  
  // Step 7: Schedule & Dates
  startDate: string;
  endDate?: string;
  adSchedule: boolean;
  scheduleDetails?: any[];
  
  // Step 8: Ad Extensions
  sitelinks: { text: string; url: string; description?: string }[];
  callouts: string[];
  structuredSnippets: { header: string; values: string[] }[];
  
  // Step 9: Conversion Tracking
  conversionActions: string[];
  conversionGoals: { action: string; value: number; currency: string }[];
  
  // Step 10: Keywords (for Search campaigns)
  keywords: { text: string; matchType: 'EXACT' | 'PHRASE' | 'BROAD' }[];
  negativeKeywords: string[];
  
  // Step 11: Ad Creative - Headlines
  headlines: string[];
  longHeadline?: string;
  
  // Step 12: Ad Creative - Descriptions
  descriptions: string[];
  businessName: string;
  
  // Step 13: Images & Media
  images: any[];
  logos: any[];
  videos: any[];
  
  // Step 14: Final URLs
  finalUrls: string[];
  trackingTemplate?: string;
  customParameters?: { key: string; value: string }[];
  
  // Step 15: Review & Launch
  reviewComplete: boolean;
}

const ComprehensiveGoogleAdsLauncher: React.FC = () => {
  const [form] = Form.useForm();
  const [formData, setFormData] = useState<Partial<CampaignFormData>>({
    campaignType: 'PERFORMANCE_MAX',
    objective: 'SALES',
    campaignStatus: 'ENABLED',
    budgetType: 'DAILY',
    biddingStrategy: 'MAXIMIZE_CONVERSIONS',
    locationIntent: 'PRESENCE_OR_INTEREST',
    languages: ['1000'], // English
    adSchedule: false,
    sitelinks: [],
    callouts: [],
    structuredSnippets: [],
    conversionGoals: [],
    keywords: [],
    headlines: [],
    descriptions: [],
    images: [],
    logos: [],
    videos: [],
    finalUrls: [],
    customParameters: [],
    reviewComplete: false
  });
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const steps = [
    'Campaign Type', 'Campaign Settings', 'Budget & Bidding', 'Location Targeting', 'Language Targeting',
    'Audience Targeting', 'Schedule & Dates', 'Ad Extensions', 'Conversion Tracking', 'Keywords',
    'Headlines', 'Descriptions', 'Images & Media', 'Final URLs', 'Review & Launch'
  ];

  const handleFormChange = (changedFields: any, allFields: any) => {
    const newData = { ...formData };
    changedFields.forEach(({ name, value }: any) => {
      if (Array.isArray(name)) {
        let current = newData as any;
        for (let i = 0; i < name.length - 1; i++) {
          if (!current[name[i]]) current[name[i]] = {};
          current = current[name[i]];
        }
        current[name[name.length - 1]] = value;
      } else {
        (newData as any)[name] = value;
      }
    });
    setFormData(newData);
  };

  const addHeadline = () => {
    const headlines = [...(formData.headlines || [])];
    if (headlines.length < 15) {
      headlines.push('');
      setFormData({ ...formData, headlines });
      form.setFieldsValue({ headlines });
    }
  };

  const addDescription = () => {
    const descriptions = [...(formData.descriptions || [])];
    if (descriptions.length < 4) {
      descriptions.push('');
      setFormData({ ...formData, descriptions });
      form.setFieldsValue({ descriptions });
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const values = await form.validateFields();
      
      // Here you would make the API call to create the campaign
      console.log('Campaign Data:', values);
      
      message.success('Campaign created successfully!');
      
      // Reset form or redirect
      form.resetFields();
      setFormData({});
      setCurrentStep(0);
      
    } catch (error) {
      console.error('Campaign creation failed:', error);
      message.error('Failed to create campaign. Please check all fields.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-lg font-bold">G</span>
              </div>
              <div>
                <Title level={3} className="mb-0 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Google Ads Campaign Creator
                </Title>
                <Text type="secondary" className="text-sm">Professional campaign setup in 15 comprehensive steps</Text>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">15</div>
                <Text type="secondary" className="text-xs">Complete Steps</Text>
              </div>
              <Button 
                type="primary" 
                onClick={handleSubmit} 
                loading={isSubmitting} 
                size="large"
                className="bg-gradient-to-r from-blue-600 to-purple-600 border-0 shadow-lg hover:shadow-xl transition-all duration-300 px-8 h-12 rounded-xl"
              >
                <RocketOutlined className="text-lg" /> Launch Campaign
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <Form
          form={form}
          layout="vertical"
          onValuesChange={handleFormChange}
          initialValues={formData}
          className="space-y-8"
        >
          {/* Step 1: Campaign Type & Objective */}
          <Card 
            title={
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">1</span>
                </div>
                <span className="text-lg font-semibold text-gray-800">Campaign Type & Objective</span>
              </div>
            }
            className="shadow-lg border-0 rounded-xl overflow-hidden mb-6"
            headStyle={{ 
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              padding: '20px 24px'
            }}
            bodyStyle={{ padding: '32px' }}
          >
            <Row gutter={[32, 24]}>
              <Col xs={24} md={12}>
                <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                  <Form.Item
                    label={<span className="text-base font-semibold text-gray-700 flex items-center space-x-2"><span>🎯</span><span>Campaign Type</span></span>}
                    name="campaignType"
                    rules={[{ required: true, message: 'Please select a campaign type' }]}
                    className="mb-0"
                  >
                    <Select size="large" placeholder="Choose campaign type" className="rounded-lg">
                      <Option value="PERFORMANCE_MAX">
                        <div className="flex items-center space-x-3 py-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <div>
                            <div className="font-medium">Performance Max</div>
                            <div className="text-xs text-gray-500">AI-powered across all Google properties</div>
                          </div>
                        </div>
                      </Option>
                      <Option value="DISPLAY">
                        <div className="flex items-center space-x-3 py-2">
                          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                          <div>
                            <div className="font-medium">Display Network</div>
                            <div className="text-xs text-gray-500">Visual ads across websites & apps</div>
                          </div>
                        </div>
                      </Option>
                      <Option value="SEARCH">
                        <div className="flex items-center space-x-3 py-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <div>
                            <div className="font-medium">Search Network</div>
                            <div className="text-xs text-gray-500">Text ads on Google search results</div>
                          </div>
                        </div>
                      </Option>
                    </Select>
                  </Form.Item>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div className="bg-purple-50 rounded-xl p-6 border border-purple-100">
                  <Form.Item
                    label={<span className="text-base font-semibold text-gray-700 flex items-center space-x-2"><span>🚀</span><span>Campaign Objective</span></span>}
                    name="objective"
                    rules={[{ required: true, message: 'Please select an objective' }]}
                    className="mb-0"
                  >
                    <Select size="large" placeholder="Choose your goal" className="rounded-lg">
                      <Option value="SALES">
                        <div className="flex items-center space-x-3 py-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <div>
                            <div className="font-medium">Drive Sales</div>
                            <div className="text-xs text-gray-500">Increase online & offline sales</div>
                          </div>
                        </div>
                      </Option>
                      <Option value="LEADS">
                        <div className="flex items-center space-x-3 py-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <div>
                            <div className="font-medium">Generate Leads</div>
                            <div className="text-xs text-gray-500">Get more leads & conversions</div>
                          </div>
                        </div>
                      </Option>
                      <Option value="WEBSITE_TRAFFIC">
                        <div className="flex items-center space-x-3 py-2">
                          <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                          <div>
                            <div className="font-medium">Website Traffic</div>
                            <div className="text-xs text-gray-500">Drive more visitors to your site</div>
                          </div>
                        </div>
                      </Option>
                      <Option value="BRAND_AWARENESS">
                        <div className="flex items-center space-x-3 py-2">
                          <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                          <div>
                            <div className="font-medium">Brand Awareness</div>
                            <div className="text-xs text-gray-500">Increase brand recognition</div>
                          </div>
                        </div>
                      </Option>
                    </Select>
                  </Form.Item>
                </div>
              </Col>
            </Row>
          </Card>

          {/* Step 2: Campaign Settings */}
          <Card title="2. Campaign Settings" className="shadow-sm">
            <Row gutter={[24, 16]}>
              <Col xs={24} md={16}>
                <Form.Item
                  label="Campaign Name"
                  name="campaignName"
                  rules={[{ required: true, message: 'Please enter a campaign name' }]}
                >
                  <Input size="large" placeholder="Enter descriptive campaign name" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Campaign Status" name="campaignStatus">
                  <Radio.Group size="large">
                    <Radio.Button value="ENABLED">Enabled</Radio.Button>
                    <Radio.Button value="PAUSED">Paused</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Step 3: Budget & Bidding */}
          <Card title="3. Budget & Bidding Strategy" className="shadow-sm">
            <Row gutter={[24, 16]}>
              <Col xs={24} md={8}>
                <Form.Item label="Budget Type" name="budgetType">
                  <Select size="large">
                    <Option value="DAILY">Daily Budget</Option>
                    <Option value="CAMPAIGN_TOTAL">Campaign Total</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Budget Amount ($)"
                  name="budgetAmount"
                  rules={[{ required: true, message: 'Please enter budget amount' }]}
                >
                  <InputNumber
                    size="large"
                    min={1}
                    precision={2}
                    style={{ width: '100%' }}
                    placeholder="0.00"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Bidding Strategy" name="biddingStrategy">
                  <Select size="large">
                    <Option value="MAXIMIZE_CLICKS">Maximize Clicks</Option>
                    <Option value="MAXIMIZE_CONVERSIONS">Maximize Conversions</Option>
                    <Option value="TARGET_CPA">Target CPA</Option>
                    <Option value="TARGET_ROAS">Target ROAS</Option>
                    <Option value="MANUAL_CPC">Manual CPC</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            
            {(formData.biddingStrategy === 'TARGET_CPA' || formData.biddingStrategy === 'TARGET_ROAS') && (
              <Row gutter={[24, 16]}>
                {formData.biddingStrategy === 'TARGET_CPA' && (
                  <Col xs={24} md={12}>
                    <Form.Item label="Target CPA ($)" name="targetCpa">
                      <InputNumber size="large" min={0} precision={2} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                )}
                {formData.biddingStrategy === 'TARGET_ROAS' && (
                  <Col xs={24} md={12}>
                    <Form.Item label="Target ROAS (%)" name="targetRoas">
                      <InputNumber size="large" min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            )}
          </Card>

          {/* Step 4: Location Targeting */}
          <Card title="4. Location Targeting" className="shadow-sm">
            <Row gutter={[24, 16]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Target Locations"
                  name="locations"
                  rules={[{ required: true, message: 'Please select target locations' }]}
                >
                  <Select
                    mode="multiple"
                    size="large"
                    placeholder="Select countries, regions, or cities"
                    showSearch
                  >
                    <Option value="US">United States</Option>
                    <Option value="CA">Canada</Option>
                    <Option value="GB">United Kingdom</Option>
                    <Option value="AU">Australia</Option>
                    <Option value="DE">Germany</Option>
                    <Option value="FR">France</Option>
                    <Option value="IN">India</Option>
                    <Option value="JP">Japan</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Location Intent" name="locationIntent">
                  <Select size="large">
                    <Option value="PRESENCE">People in your targeted locations</Option>
                    <Option value="INTEREST">People interested in your targeted locations</Option>
                    <Option value="PRESENCE_OR_INTEREST">People in, or who show interest in, your targeted locations</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Step 5: Language Targeting */}
          <Card title="5. Language Targeting" className="shadow-sm">
            <Form.Item
              label="Target Languages"
              name="languages"
              rules={[{ required: true, message: 'Please select target languages' }]}
            >
              <Select mode="multiple" size="large" placeholder="Select languages">
                <Option value="1000">English</Option>
                <Option value="1003">Spanish</Option>
                <Option value="1002">French</Option>
                <Option value="1001">German</Option>
                <Option value="1004">Italian</Option>
                <Option value="1014">Portuguese</Option>
                <Option value="1005">Japanese</Option>
                <Option value="1018">Chinese (Simplified)</Option>
              </Select>
            </Form.Item>
          </Card>

          {/* Step 6: Audience Targeting */}
          <Card 
            title={
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">6</span>
                </div>
                <span className="text-lg font-semibold text-gray-800">Audience Targeting</span>
              </div>
            } 
            className="shadow-lg border-0 rounded-xl overflow-hidden mb-6"
            headStyle={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              padding: '20px 24px'
            }}
            bodyStyle={{ padding: '32px' }}
          >
            <div className="space-y-6">
              <div>
                <Form.Item 
                  label={<span className="text-base font-medium text-gray-700">Audience Segments</span>} 
                  name="audiences"
                >
                  <Select 
                    mode="multiple" 
                    size="large" 
                    placeholder="Select audience segments to target"
                    className="rounded-lg"
                    style={{ borderRadius: '8px' }}
                  >
                    <Option value="remarketing">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        <span>Website Visitors</span>
                      </div>
                    </Option>
                    <Option value="similar">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span>Similar Audiences</span>
                      </div>
                    </Option>
                    <Option value="custom_intent">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                        <span>Custom Intent</span>
                      </div>
                    </Option>
                    <Option value="in_market">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                        <span>In-Market Audiences</span>
                      </div>
                    </Option>
                    <Option value="affinity">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        <span>Affinity Audiences</span>
                      </div>
                    </Option>
                  </Select>
                </Form.Item>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-6">
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">👥</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Demographics</h3>
                </div>
                
                <Row gutter={[32, 24]}>
                  <Col xs={24} lg={8}>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                      <Form.Item 
                        label={<span className="text-sm font-semibold text-gray-700 flex items-center space-x-2"><span>🎂</span><span>Age Ranges</span></span>} 
                        name={['demographics', 'ageRanges']}
                        className="mb-0"
                      >
                        <Select
                          mode="multiple"
                          size="large"
                          placeholder="Select age ranges"
                          className="w-full"
                          style={{ borderRadius: '8px' }}
                        >
                          <Option value="18-24">
                            <div className="flex items-center justify-between">
                              <span>18-24 years</span>
                              <span className="text-xs text-gray-500">Young Adults</span>
                            </div>
                          </Option>
                          <Option value="25-34">
                            <div className="flex items-center justify-between">
                              <span>25-34 years</span>
                              <span className="text-xs text-gray-500">Millennials</span>
                            </div>
                          </Option>
                          <Option value="35-44">
                            <div className="flex items-center justify-between">
                              <span>35-44 years</span>
                              <span className="text-xs text-gray-500">Gen X</span>
                            </div>
                          </Option>
                          <Option value="45-54">
                            <div className="flex items-center justify-between">
                              <span>45-54 years</span>
                              <span className="text-xs text-gray-500">Middle-aged</span>
                            </div>
                          </Option>
                          <Option value="55-64">
                            <div className="flex items-center justify-between">
                              <span>55-64 years</span>
                              <span className="text-xs text-gray-500">Pre-retirement</span>
                            </div>
                          </Option>
                          <Option value="65+">
                            <div className="flex items-center justify-between">
                              <span>65+ years</span>
                              <span className="text-xs text-gray-500">Seniors</span>
                            </div>
                          </Option>
                        </Select>
                      </Form.Item>
                    </div>
                  </Col>
                  
                  <Col xs={24} lg={8}>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                      <Form.Item 
                        label={<span className="text-sm font-semibold text-gray-700 flex items-center space-x-2"><span>⚧</span><span>Gender</span></span>} 
                        name={['demographics', 'genders']}
                        className="mb-0"
                      >
                        <Select
                          mode="multiple"
                          size="large"
                          placeholder="Select genders"
                          className="w-full"
                          style={{ borderRadius: '8px' }}
                        >
                          <Option value="male">
                            <div className="flex items-center space-x-3">
                              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                              <span>Male</span>
                            </div>
                          </Option>
                          <Option value="female">
                            <div className="flex items-center space-x-3">
                              <span className="w-3 h-3 bg-pink-500 rounded-full"></span>
                              <span>Female</span>
                            </div>
                          </Option>
                          <Option value="undetermined">
                            <div className="flex items-center space-x-3">
                              <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
                              <span>Undetermined</span>
                            </div>
                          </Option>
                        </Select>
                      </Form.Item>
                    </div>
                  </Col>
                  
                  <Col xs={24} lg={8}>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                      <Form.Item 
                        label={<span className="text-sm font-semibold text-gray-700 flex items-center space-x-2"><span>👶</span><span>Parental Status</span></span>} 
                        name={['demographics', 'parentalStatus']}
                        className="mb-0"
                      >
                        <Select
                          mode="multiple"
                          size="large"
                          placeholder="Select parental status"
                          className="w-full"
                          style={{ borderRadius: '8px' }}
                        >
                          <Option value="parent">
                            <div className="flex items-center space-x-3">
                              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                              <span>Parent</span>
                            </div>
                          </Option>
                          <Option value="not_parent">
                            <div className="flex items-center space-x-3">
                              <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                              <span>Not a parent</span>
                            </div>
                          </Option>
                          <Option value="undetermined">
                            <div className="flex items-center space-x-3">
                              <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
                              <span>Undetermined</span>
                            </div>
                          </Option>
                        </Select>
                      </Form.Item>
                    </div>
                  </Col>
                </Row>
              </div>
            </div>
          </Card>

          {/* Step 7: Schedule & Dates */}
          <Card title="7. Campaign Schedule & Dates" className="shadow-sm">
            <Row gutter={[24, 16]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Start Date"
                  name="startDate"
                  rules={[{ required: true, message: 'Please select start date' }]}
                >
                  <DatePicker 
                    size="large" 
                    style={{ width: '100%' }}
                    disabledDate={(current) => current && current < dayjs().startOf('day')}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="End Date (Optional)" name="endDate">
                  <DatePicker size="large" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            
            <Form.Item label="Ad Scheduling" name="adSchedule" valuePropName="checked">
              <Switch /> 
              <Text type="secondary" style={{ marginLeft: 8 }}>
                Enable custom ad scheduling (show ads only at specific times)
              </Text>
            </Form.Item>
          </Card>

          {/* Step 8: Ad Extensions */}
          <Card title="8. Ad Extensions" className="shadow-sm">
            <Collapse>
              <Panel header="Sitelinks" key="sitelinks">
                <Form.List name="sitelinks">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <Row key={key} gutter={[16, 8]} align="middle">
                          <Col xs={24} md={8}>
                            <Form.Item
                              {...restField}
                              name={[name, 'text']}
                              rules={[{ required: true, message: 'Missing sitelink text' }]}
                            >
                              <Input placeholder="Sitelink text" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={10}>
                            <Form.Item
                              {...restField}
                              name={[name, 'url']}
                              rules={[{ required: true, message: 'Missing URL' }]}
                            >
                              <Input placeholder="https://example.com/page" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={4}>
                            <Button type="link" onClick={() => remove(name)}>
                              Remove
                            </Button>
                          </Col>
                        </Row>
                      ))}
                      <Form.Item>
                        <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                          Add Sitelink
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </Panel>
              
              <Panel header="Callouts" key="callouts">
                <Form.Item label="Callouts" name="callouts">
                  <Select
                    mode="tags"
                    size="large"
                    placeholder="Add callout text (e.g., Free Shipping, 24/7 Support)"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Panel>
            </Collapse>
          </Card>

          {/* Step 9: Conversion Tracking */}
          <Card title="9. Conversion Tracking" className="shadow-sm">
            <Row gutter={[24, 16]}>
              <Col xs={24}>
                <Form.Item label="Conversion Actions" name="conversionActions">
                  <Select mode="multiple" size="large" placeholder="Select conversion actions to track">
                    <Option value="purchase">Purchase</Option>
                    <Option value="lead">Lead Generation</Option>
                    <Option value="signup">Sign Up</Option>
                    <Option value="download">App Download</Option>
                    <Option value="call">Phone Call</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            
            <Form.List name="conversionGoals">
              {(fields, { add, remove }) => (
                <>
                  <Text strong>Conversion Values:</Text>
                  {fields.map(({ key, name, ...restField }) => (
                    <Row key={key} gutter={[16, 8]} align="middle" style={{ marginTop: 8 }}>
                      <Col xs={24} md={8}>
                        <Form.Item {...restField} name={[name, 'action']}>
                          <Select placeholder="Conversion action">
                            <Option value="purchase">Purchase</Option>
                            <Option value="lead">Lead</Option>
                            <Option value="signup">Sign Up</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item {...restField} name={[name, 'value']}>
                          <InputNumber placeholder="Value" min={0} precision={2} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item {...restField} name={[name, 'currency']}>
                          <Select placeholder="Currency">
                            <Option value="USD">USD</Option>
                            <Option value="EUR">EUR</Option>
                            <Option value="GBP">GBP</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        <Button type="link" onClick={() => remove(name)}>Remove</Button>
                      </Col>
                    </Row>
                  ))}
                  <Form.Item style={{ marginTop: 16 }}>
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      Add Conversion Goal
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Card>

          {/* Step 10: Keywords (for Search campaigns) */}
          {formData.campaignType === 'SEARCH' && (
            <Card title="10. Keywords" className="shadow-sm">
              <Form.List name="keywords">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <Row key={key} gutter={[16, 8]} align="middle">
                        <Col xs={24} md={12}>
                          <Form.Item
                            {...restField}
                            name={[name, 'text']}
                            rules={[{ required: true, message: 'Missing keyword' }]}
                          >
                            <Input placeholder="Enter keyword" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item {...restField} name={[name, 'matchType']}>
                            <Select placeholder="Match type">
                              <Option value="EXACT">Exact Match</Option>
                              <Option value="PHRASE">Phrase Match</Option>
                              <Option value="BROAD">Broad Match</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                          <Button type="link" onClick={() => remove(name)}>Remove</Button>
                        </Col>
                      </Row>
                    ))}
                    <Form.Item>
                      <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                        Add Keyword
                      </Button>
                    </Form.Item>
                  </>
                )}
              </Form.List>
              
              <Divider />
              <Form.Item label="Negative Keywords" name="negativeKeywords">
                <Select
                  mode="tags"
                  size="large"
                  placeholder="Add negative keywords to exclude"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Card>
          )}

          {/* Step 11: Headlines */}
          <Card title="11. Ad Headlines" className="shadow-sm">
            <div className="mb-4">
              <Text strong>Headlines (Up to 15)</Text>
              <Text type="secondary" className="ml-2">• Each headline should be 30 characters or less</Text>
            </div>
            
            <Form.List name="headlines">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }, index) => (
                    <Row key={key} gutter={[16, 8]} align="middle">
                      <Col xs={24} md={20}>
                        <Form.Item
                          {...restField}
                          name={name}
                          rules={[
                            { required: index < 3, message: 'First 3 headlines are required' },
                            { max: 30, message: 'Headlines must be 30 characters or less' }
                          ]}
                        >
                          <Input 
                            placeholder={`Headline ${index + 1}${index < 3 ? ' (Required)' : ''}`}
                            showCount
                            maxLength={30}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        {index >= 3 && (
                          <Button type="link" onClick={() => remove(name)}>Remove</Button>
                        )}
                      </Col>
                    </Row>
                  ))}
                  {fields.length < 15 && (
                    <Form.Item>
                      <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                        Add Headline ({fields.length}/15)
                      </Button>
                    </Form.Item>
                  )}
                </>
              )}
            </Form.List>
          </Card>

          {/* Step 12: Descriptions */}
          <Card title="12. Ad Descriptions & Business Info" className="shadow-sm">
            <div className="mb-4">
              <Text strong>Descriptions (Up to 4)</Text>
              <Text type="secondary" className="ml-2">• Each description should be 90 characters or less</Text>
            </div>
            
            <Form.List name="descriptions">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }, index) => (
                    <Row key={key} gutter={[16, 8]} align="middle">
                      <Col xs={24} md={20}>
                        <Form.Item
                          {...restField}
                          name={name}
                          rules={[
                            { required: index < 2, message: 'First 2 descriptions are required' },
                            { max: 90, message: 'Descriptions must be 90 characters or less' }
                          ]}
                        >
                          <TextArea 
                            placeholder={`Description ${index + 1}${index < 2 ? ' (Required)' : ''}`}
                            showCount
                            maxLength={90}
                            rows={2}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        {index >= 2 && (
                          <Button type="link" onClick={() => remove(name)}>Remove</Button>
                        )}
                      </Col>
                    </Row>
                  ))}
                  {fields.length < 4 && (
                    <Form.Item>
                      <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                        Add Description ({fields.length}/4)
                      </Button>
                    </Form.Item>
                  )}
                </>
              )}
            </Form.List>
            
            <Divider />
            <Form.Item
              label="Business Name"
              name="businessName"
              rules={[{ required: true, message: 'Please enter your business name' }]}
            >
              <Input size="large" placeholder="Your business name" maxLength={25} showCount />
            </Form.Item>
          </Card>

          {/* Step 13: Images & Media */}
          <Card title="13. Images & Media Assets" className="shadow-sm">
            <Row gutter={[24, 24]}>
              <Col xs={24} md={12}>
                <Form.Item label="Marketing Images" name="images">
                  <Upload.Dragger
                    multiple
                    accept="image/*"
                    beforeUpload={() => false}
                    onChange={(info) => {
                      setFormData({ ...formData, images: info.fileList });
                    }}
                  >
                    <p className="ant-upload-drag-icon">
                      <PictureOutlined />
                    </p>
                    <p className="ant-upload-text">Upload Marketing Images</p>
                    <p className="ant-upload-hint">
                      Recommended: 1200x628px, 1200x1200px, 960x1200px
                    </p>
                  </Upload.Dragger>
                </Form.Item>
              </Col>
              
              <Col xs={24} md={12}>
                <Form.Item label="Logo Images" name="logos">
                  <Upload.Dragger
                    multiple
                    accept="image/*"
                    beforeUpload={() => false}
                    onChange={(info) => {
                      setFormData({ ...formData, logos: info.fileList });
                    }}
                  >
                    <p className="ant-upload-drag-icon">
                      <PictureOutlined />
                    </p>
                    <p className="ant-upload-text">Upload Logo Images</p>
                    <p className="ant-upload-hint">
                      Square logos: 1200x1200px, Landscape logos: 1200x300px
                    </p>
                  </Upload.Dragger>
                </Form.Item>
              </Col>
            </Row>
            
            <Form.Item label="Video Assets (Optional)" name="videos">
              <Upload.Dragger
                multiple
                accept="video/*"
                beforeUpload={() => false}
                onChange={(info) => {
                  setFormData({ ...formData, videos: info.fileList });
                }}
              >
                <p className="ant-upload-drag-icon">
                  <UploadOutlined />
                </p>
                <p className="ant-upload-text">Upload Video Assets</p>
                <p className="ant-upload-hint">
                  MP4, MOV, AVI formats. Recommended: 16:9 aspect ratio
                </p>
              </Upload.Dragger>
            </Form.Item>
          </Card>

          {/* Step 14: Final URLs */}
          <Card title="14. Final URLs & Tracking" className="shadow-sm">
            <Form.Item
              label="Final URLs"
              name="finalUrls"
              rules={[{ required: true, message: 'Please enter at least one final URL' }]}
            >
              <Select
                mode="tags"
                size="large"
                placeholder="https://example.com/landing-page"
                style={{ width: '100%' }}
              />
            </Form.Item>
            
            <Form.Item label="Tracking Template (Optional)" name="trackingTemplate">
              <Input size="large" placeholder="https://example.com/track?url={lpurl}&campaign={campaignid}" />
            </Form.Item>
            
            <Form.List name="customParameters">
              {(fields, { add, remove }) => (
                <>
                  <Text strong>Custom Parameters:</Text>
                  {fields.map(({ key, name, ...restField }) => (
                    <Row key={key} gutter={[16, 8]} align="middle" style={{ marginTop: 8 }}>
                      <Col xs={24} md={10}>
                        <Form.Item {...restField} name={[name, 'key']}>
                          <Input placeholder="Parameter key" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={10}>
                        <Form.Item {...restField} name={[name, 'value']}>
                          <Input placeholder="Parameter value" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        <Button type="link" onClick={() => remove(name)}>Remove</Button>
                      </Col>
                    </Row>
                  ))}
                  <Form.Item style={{ marginTop: 16 }}>
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      Add Custom Parameter
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Card>

          {/* Step 15: Review & Launch */}
          <Card title="15. Review & Launch Campaign" className="shadow-sm">
            <Alert
              message="Campaign Review"
              description="Please review all settings above before launching your campaign. Once launched, some settings cannot be changed."
              type="info"
              showIcon
              className="mb-4"
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <Text strong className="text-blue-800">Campaign Type:</Text>
                <div className="text-blue-600">{formData.campaignType || 'Not selected'}</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <Text strong className="text-green-800">Daily Budget:</Text>
                <div className="text-green-600">${formData.budgetAmount || '0.00'}</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <Text strong className="text-purple-800">Locations:</Text>
                <div className="text-purple-600">{formData.locations?.length || 0} selected</div>
              </div>
            </div>
            
            <Form.Item name="reviewComplete" valuePropName="checked">
              <Checkbox>
                I have reviewed all campaign settings and am ready to launch this campaign.
              </Checkbox>
            </Form.Item>
            
            <div className="text-center pt-6">
              <Button 
                type="primary" 
                size="large" 
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={!formData.reviewComplete}
                className="px-12"
              >
                <RocketOutlined /> Launch Google Ads Campaign
              </Button>
            </div>
          </Card>
        </Form>
      </div>
    </div>
  );
};

export default ComprehensiveGoogleAdsLauncher;
