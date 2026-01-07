'use client';

import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Alert,
  message,
  Divider,
  Tag,
  Tooltip,
  Row,
  Col,
} from 'antd';
import {
  LinkOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  GlobalOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface GeneratedUrl {
  url: string;
  template: string;
  params: {
    domain: string;
    articleId: string;
    channelId: string;
  };
  googleAdsMacros: {
    campaignId: string;
    adGroupId: string;
    creativeId: string;
    customerId: string;
  };
}

export default function PredictoUrlBuilder() {
  const [form] = Form.useForm();
  const [generatedUrl, setGeneratedUrl] = useState<GeneratedUrl | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (values: any) => {
    setLoading(true);

    try {
      const response = await fetch('/api/predicto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'generate-url',
          domain: values.domain,
          articleId: values.articleId,
          channelId: values.channelId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedUrl({
          url: data.url,
          template: data.template,
          params: data.params,
          googleAdsMacros: data.macros,
        });
        message.success('Tracking URL generated successfully!');
      } else {
        message.error(data.error || 'Failed to generate URL');
      }
    } catch (error) {
      console.error('Error generating URL:', error);
      message.error('Failed to generate tracking URL');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl.url);
      setCopied(true);
      message.success('URL copied to clipboard!');

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setGeneratedUrl(null);
    setCopied(false);
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <LinkOutlined style={{ color: '#1890ff' }} />
            <span>Predicto Tracking URL Builder</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Alert
          message="Google Ads GDN Campaign Setup"
          description="Generate tracking URLs for your Google Display Network (GDN) campaigns. The URL will include Google Ads macros that automatically populate with campaign details when ads are clicked."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleGenerate}
          initialValues={{
            domain: '',
            articleId: '',
            channelId: '',
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                label={
                  <Space>
                    <GlobalOutlined />
                    <span>Domain</span>
                  </Space>
                }
                name="domain"
                rules={[
                  { required: true, message: 'Please enter domain' },
                  {
                    pattern: /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    message: 'Please enter a valid domain (e.g., example.com)',
                  },
                ]}
                tooltip="The base domain for your tracking URL (e.g., example.com)"
              >
                <Input placeholder="example.com" size="large" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item
                label="Article/Search ID"
                name="articleId"
                rules={[{ required: true, message: 'Please enter article/search ID' }]}
                tooltip="The article or search parameter ID for your landing page"
              >
                <Input placeholder="article123" size="large" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item
                label="Channel ID (cid)"
                name="channelId"
                rules={[{ required: true, message: 'Please enter channel ID' }]}
                tooltip="The channel ID parameter for tracking"
              >
                <Input placeholder="channel1" size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading} size="large" icon={<LinkOutlined />}>
                Generate Tracking URL
              </Button>
              <Button onClick={handleReset} size="large">
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {generatedUrl && (
        <Card
          title={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>Generated Tracking URL</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <div style={{ marginBottom: 8 }}>
                <Text strong>Final URL (Ready to use in Google Ads):</Text>
                <Tooltip title="Copy to clipboard">
                  <Button
                    type="link"
                    icon={copied ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
                    onClick={handleCopyUrl}
                    style={{ float: 'right' }}
                  >
                    {copied ? 'Copied!' : 'Copy URL'}
                  </Button>
                </Tooltip>
              </div>
              <TextArea
                value={generatedUrl.url}
                readOnly
                autoSize={{ minRows: 3, maxRows: 6 }}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  backgroundColor: '#f5f5f5',
                }}
              />
            </div>

            <Divider />

            <div>
              <Title level={5}>
                <InfoCircleOutlined /> URL Parameters
              </Title>
              <Row gutter={[16, 8]}>
                <Col span={8}>
                  <Text strong>Domain:</Text> {generatedUrl.params.domain}
                </Col>
                <Col span={8}>
                  <Text strong>Article ID:</Text> {generatedUrl.params.articleId}
                </Col>
                <Col span={8}>
                  <Text strong>Channel ID:</Text> {generatedUrl.params.channelId}
                </Col>
              </Row>
            </div>

            <Divider />

            <div>
              <Title level={5}>Google Ads Macros (Auto-filled)</Title>
              <Paragraph>
                <Text type="secondary">
                  These macros will be automatically replaced by Google Ads when someone clicks your ad:
                </Text>
              </Paragraph>
              <Space wrap>
                <Tag color="blue">
                  <strong>campaign_id:</strong> {generatedUrl.googleAdsMacros.campaignId}
                </Tag>
                <Tag color="purple">
                  <strong>adset_id:</strong> {generatedUrl.googleAdsMacros.adGroupId}
                </Tag>
                <Tag color="green">
                  <strong>ad_id:</strong> {generatedUrl.googleAdsMacros.creativeId}
                </Tag>
                <Tag color="orange">
                  <strong>account_id:</strong> {generatedUrl.googleAdsMacros.customerId}
                </Tag>
              </Space>
            </div>

            <Alert
              message="How to Use This URL"
              description={
                <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                  <li>Copy the generated URL above</li>
                  <li>In Google Ads, create or edit your GDN campaign</li>
                  <li>Paste this URL as your Final URL in the ad or ad group settings</li>
                  <li>
                    Google Ads will automatically replace the macros (like {'{campaignid}'}) with actual values when
                    ads are clicked
                  </li>
                  <li>Predicto will receive the campaign_id parameter for accurate revenue tracking</li>
                </ul>
              }
              type="success"
              showIcon
            />

            <Alert
              message="Revenue Tracking"
              description={
                <>
                  <Paragraph>
                    <strong>Campaign ID Matching:</strong> Predicto tracks revenue using the <code>campaign_id</code>{' '}
                    parameter. This allows for direct matching between Google Ads cost data and Predicto revenue data
                    without needing GCLID or other complex tracking.
                  </Paragraph>
                  <Paragraph style={{ marginBottom: 0 }}>
                    <strong>Benefits:</strong> Simpler setup, more reliable tracking, and easier debugging compared to
                    GCLID-based tracking.
                  </Paragraph>
                </>
              }
              type="info"
              showIcon
            />
          </Space>
        </Card>
      )}

      {/* Example Card */}
      <Card title="Example">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Input Example:</Text>
            <ul style={{ marginTop: 8 }}>
              <li>Domain: example.com</li>
              <li>Article ID: tech-news-123</li>
              <li>Channel ID: channel-gdn-001</li>
            </ul>
          </div>

          <div>
            <Text strong>Generated URL:</Text>
            <TextArea
              value="https://example.com/asrsearch?search=tech-news-123&source=googleads&cid=channel-gdn-001&campaign_id={campaignid}&adset_id={adgroupid}&ad_id={creative}&account_id={customerid}&event=lead"
              readOnly
              autoSize={{ minRows: 2 }}
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                backgroundColor: '#fafafa',
                marginTop: 8,
              }}
            />
          </div>

          <Alert
            message="Pro Tip"
            description="You can create multiple tracking URLs for different articles/channels and use them in different ad groups to track performance at a granular level."
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
          />
        </Space>
      </Card>
    </div>
  );
}
