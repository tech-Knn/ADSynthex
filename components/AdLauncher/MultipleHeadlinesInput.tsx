'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface MultipleHeadlinesInputProps {
  initialHeadlines?: string[];
  maxHeadlines?: number;
  minHeadlines?: number;
}

const MultipleHeadlinesInput: React.FC<MultipleHeadlinesInputProps> = ({
  initialHeadlines = ['', ''],
  maxHeadlines = 15,
  minHeadlines = 2
}) => {
  const [headlines, setHeadlines] = useState<string[]>(
    initialHeadlines.length >= minHeadlines ? initialHeadlines : Array(minHeadlines).fill('')
  );

  const addHeadline = () => {
    if (headlines.length < maxHeadlines) {
      setHeadlines([...headlines, '']);
    }
  };

  const removeHeadline = (index: number) => {
    if (headlines.length > minHeadlines) {
      const newHeadlines = headlines.filter((_, i) => i !== index);
      setHeadlines(newHeadlines);
    }
  };

  const updateHeadline = (index: number, value: string) => {
    const newHeadlines = [...headlines];
    newHeadlines[index] = value;
    setHeadlines(newHeadlines);
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong>
          Headlines ({headlines.filter(h => h.trim()).length}/{maxHeadlines})
        </Text>
        <Text type="secondary" style={{ marginLeft: 8 }}>
          <InfoCircleOutlined style={{ marginRight: 4 }} />
          Google will test different combinations automatically
        </Text>
      </div>
      
      {headlines.map((headline, index) => (
        <Form.Item
          key={index}
          name={`headline${index + 1}`}
          label={`Headline ${index + 1} ${index < minHeadlines ? '*' : ''}`}
          rules={[
            {
              required: index < minHeadlines,
              message: `Headline ${index + 1} is required`
            },
            {
              max: 30,
              message: 'Headlines must be 30 characters or less'
            }
          ]}
          style={{ marginBottom: 16 }}
        >
          <Space.Compact style={{ display: 'flex' }}>
            <Input
              placeholder={
                index === 0 
                  ? "Quality Industrial Equipment"
                  : index === 1
                  ? "Expert Solutions & Support"
                  : "Best Prices Guaranteed"
              }
              maxLength={30}
              showCount
              value={headline}
              onChange={(e) => updateHeadline(index, e.target.value)}
              style={{ flex: 1 }}
            />
            {headlines.length > minHeadlines && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeHeadline(index)}
                style={{ flexShrink: 0 }}
              />
            )}
          </Space.Compact>
        </Form.Item>
      ))}
      
      {headlines.length < maxHeadlines && (
        <Button
          type="dashed"
          onClick={addHeadline}
          icon={<PlusOutlined />}
          style={{ marginBottom: 16 }}
        >
          Add Headline ({headlines.length}/{maxHeadlines})
        </Button>
      )}
      
      <Divider />
    </div>
  );
};

export default MultipleHeadlinesInput;




