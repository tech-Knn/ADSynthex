'use client';

import React, { useState } from 'react';
import { 
  Typography, 
  Card, 
  Select, 
  Button, 
  Space, 
  Tag, 
  Input,
  Divider,
  Row,
  Col,
  Alert,
  Tooltip
} from 'antd';
import { 
  GlobalOutlined, 
  TranslationOutlined,
  PlusOutlined,
  DeleteOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Search } = Input;

// Common countries for Google Ads
const POPULAR_COUNTRIES = [
  { code: 'US', name: 'United States', geoId: '2840' },
  { code: 'CA', name: 'Canada', geoId: '2124' },
  { code: 'GB', name: 'United Kingdom', geoId: '2826' },
  { code: 'AU', name: 'Australia', geoId: '2036' },
  { code: 'DE', name: 'Germany', geoId: '2276' },
  { code: 'FR', name: 'France', geoId: '2250' },
  { code: 'IN', name: 'India', geoId: '2356' },
  { code: 'JP', name: 'Japan', geoId: '2392' },
  { code: 'BR', name: 'Brazil', geoId: '2076' },
  { code: 'MX', name: 'Mexico', geoId: '2484' },
  { code: 'IT', name: 'Italy', geoId: '2380' },
  { code: 'ES', name: 'Spain', geoId: '2724' },
  { code: 'NL', name: 'Netherlands', geoId: '2528' },
  { code: 'SE', name: 'Sweden', geoId: '2752' },
  { code: 'NO', name: 'Norway', geoId: '2578' }
];

// Common languages for Google Ads
const POPULAR_LANGUAGES = [
  { code: 'en', name: 'English', googleId: '1000' },
  { code: 'es', name: 'Spanish', googleId: '1003' },
  { code: 'fr', name: 'French', googleId: '1002' },
  { code: 'de', name: 'German', googleId: '1001' },
  { code: 'it', name: 'Italian', googleId: '1004' },
  { code: 'pt', name: 'Portuguese', googleId: '1014' },
  { code: 'nl', name: 'Dutch', googleId: '1010' },
  { code: 'ja', name: 'Japanese', googleId: '1005' },
  { code: 'ko', name: 'Korean', googleId: '1012' },
  { code: 'zh', name: 'Chinese (Simplified)', googleId: '1018' },
  { code: 'hi', name: 'Hindi', googleId: '1023' },
  { code: 'ar', name: 'Arabic', googleId: '1006' },
  { code: 'ru', name: 'Russian', googleId: '1007' },
  { code: 'sv', name: 'Swedish', googleId: '1015' },
  { code: 'no', name: 'Norwegian', googleId: '1013' }
];

export interface CampaignLocation {
  geoId: string;
  name: string;
  countryCode: string;
  type: 'country' | 'region' | 'city';
}

export interface CampaignLanguage {
  googleId: string;
  name: string;
  code: string;
}

export interface CampaignSettingsData {
  locations: CampaignLocation[];
  languages: CampaignLanguage[];
  locationBidAdjustments: { [geoId: string]: number };
}

interface CampaignSettingsProps {
  settings: CampaignSettingsData;
  onSettingsChange: (settings: CampaignSettingsData) => void;
  campaignType: string;
}

const CampaignSettings: React.FC<CampaignSettingsProps> = ({
  settings,
  onSettingsChange,
  campaignType
}) => {
  const [locationSearch, setLocationSearch] = useState('');
  const [languageSearch, setLanguageSearch] = useState('');

  const handleLocationAdd = (country: typeof POPULAR_COUNTRIES[0]) => {
    const newLocation: CampaignLocation = {
      geoId: country.geoId,
      name: country.name,
      countryCode: country.code,
      type: 'country'
    };

    // Check if already added
    if (settings.locations.some(loc => loc.geoId === country.geoId)) {
      return;
    }

    const updatedSettings = {
      ...settings,
      locations: [...settings.locations, newLocation]
    };
    onSettingsChange(updatedSettings);
  };

  const handleLocationRemove = (geoId: string) => {
    const updatedSettings = {
      ...settings,
      locations: settings.locations.filter(loc => loc.geoId !== geoId),
      locationBidAdjustments: { ...settings.locationBidAdjustments }
    };
    delete updatedSettings.locationBidAdjustments[geoId];
    onSettingsChange(updatedSettings);
  };

  const handleLanguageAdd = (language: typeof POPULAR_LANGUAGES[0]) => {
    const newLanguage: CampaignLanguage = {
      googleId: language.googleId,
      name: language.name,
      code: language.code
    };

    // Check if already added
    if (settings.languages.some(lang => lang.googleId === language.googleId)) {
      return;
    }

    const updatedSettings = {
      ...settings,
      languages: [...settings.languages, newLanguage]
    };
    onSettingsChange(updatedSettings);
  };

  const handleLanguageRemove = (googleId: string) => {
    const updatedSettings = {
      ...settings,
      languages: settings.languages.filter(lang => lang.googleId !== googleId)
    };
    onSettingsChange(updatedSettings);
  };

  const filteredCountries = POPULAR_COUNTRIES.filter(country =>
    country.name.toLowerCase().includes(locationSearch.toLowerCase()) ||
    country.code.toLowerCase().includes(locationSearch.toLowerCase())
  );

  const filteredLanguages = POPULAR_LANGUAGES.filter(language =>
    language.name.toLowerCase().includes(languageSearch.toLowerCase()) ||
    language.code.toLowerCase().includes(languageSearch.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <Title level={3} className="mb-2">Campaign Settings</Title>
        <Text type="secondary" className="text-lg">
          Choose locations and languages for your {campaignType} campaign
        </Text>
      </div>

      <Row gutter={[24, 24]}>
        {/* Locations Section */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <GlobalOutlined className="text-blue-600" />
                <span>Target Locations</span>
                <Tooltip title="Select countries where your ads will be shown">
                  <InfoCircleOutlined className="text-gray-400" />
                </Tooltip>
              </Space>
            }
            className="h-full"
          >
            <div className="mb-4">
              <Search
                placeholder="Search countries..."
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                className="mb-3"
              />
              
              {settings.locations.length > 0 && (
                <div className="mb-4">
                  <Text strong className="block mb-2">Selected Locations:</Text>
                  <div className="flex flex-wrap gap-2">
                    {settings.locations.map((location) => (
                      <Tag
                        key={location.geoId}
                        closable
                        onClose={() => handleLocationRemove(location.geoId)}
                        className="mb-1"
                      >
                        {location.name}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto">
                <div className="grid grid-cols-1 gap-2">
                  {filteredCountries.map((country) => (
                    <Button
                      key={country.code}
                      type="text"
                      onClick={() => handleLocationAdd(country)}
                      disabled={settings.locations.some(loc => loc.geoId === country.geoId)}
                      className="text-left justify-start h-auto py-2"
                      icon={<PlusOutlined />}
                    >
                      <span className="font-medium">{country.name}</span>
                      <span className="text-gray-500 ml-2">({country.code})</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {settings.locations.length === 0 && (
              <Alert
                message="No locations selected"
                description="Select at least one location to target your ads."
                type="warning"
                showIcon
                className="mt-4"
              />
            )}
          </Card>
        </Col>

        {/* Languages Section */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <TranslationOutlined className="text-green-600" />
                <span>Target Languages</span>
                <Tooltip title="Select languages your audience speaks">
                  <InfoCircleOutlined className="text-gray-400" />
                </Tooltip>
              </Space>
            }
            className="h-full"
          >
            <div className="mb-4">
              <Search
                placeholder="Search languages..."
                value={languageSearch}
                onChange={(e) => setLanguageSearch(e.target.value)}
                className="mb-3"
              />
              
              {settings.languages.length > 0 && (
                <div className="mb-4">
                  <Text strong className="block mb-2">Selected Languages:</Text>
                  <div className="flex flex-wrap gap-2">
                    {settings.languages.map((language) => (
                      <Tag
                        key={language.googleId}
                        closable
                        onClose={() => handleLanguageRemove(language.googleId)}
                        className="mb-1"
                        color="green"
                      >
                        {language.name}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto">
                <div className="grid grid-cols-1 gap-2">
                  {filteredLanguages.map((language) => (
                    <Button
                      key={language.code}
                      type="text"
                      onClick={() => handleLanguageAdd(language)}
                      disabled={settings.languages.some(lang => lang.googleId === language.googleId)}
                      className="text-left justify-start h-auto py-2"
                      icon={<PlusOutlined />}
                    >
                      <span className="font-medium">{language.name}</span>
                      <span className="text-gray-500 ml-2">({language.code})</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {settings.languages.length === 0 && (
              <Alert
                message="No languages selected"
                description="Select at least one language to target your audience."
                type="warning"
                showIcon
                className="mt-4"
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Performance Max Specific Note */}
      {campaignType === 'PERFORMANCE_MAX' && (
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <Space>
            <InfoCircleOutlined className="text-blue-600" />
            <div>
              <Text strong className="text-blue-800">Performance Max Note:</Text>
              <Paragraph className="mb-0 mt-1 text-blue-700">
                Performance Max campaigns use Google's AI to automatically optimize across all Google properties. 
                Your location and language targeting will be used as signals for the automated bidding system.
              </Paragraph>
            </div>
          </Space>
        </Card>
      )}

      {/* Summary */}
      <Card className="mt-6 bg-gray-50">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {settings.locations.length}
              </div>
              <Text type="secondary">Location{settings.locations.length !== 1 ? 's' : ''} Selected</Text>
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {settings.languages.length}
              </div>
              <Text type="secondary">Language{settings.languages.length !== 1 ? 's' : ''} Selected</Text>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default CampaignSettings;
