'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Space, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

interface MultipleDescriptionsInputProps {
  initialDescriptions?: string[];
  maxDescriptions?: number;
  minDescriptions?: number;
}

const MultipleDescriptionsInput: React.FC<MultipleDescriptionsInputProps> = ({
  initialDescriptions = [''],
  maxDescriptions = 4,
  minDescriptions = 1
}) => {
  const [descriptions, setDescriptions] = useState<string[]>(
    initialDescriptions.length >= minDescriptions ? initialDescriptions : Array(minDescriptions).fill('')
  );

  const addDescription = () => {
    if (descriptions.length < maxDescriptions) {
      setDescriptions([...descriptions, '']);
    }
  };

  const removeDescription = (index: number) => {
    if (descriptions.length > minDescriptions) {
      const newDescriptions = descriptions.filter((_, i) => i !== index);
      setDescriptions(newDescriptions);
    }
  };

  const updateDescription = (index: number, value: string) => {
    const newDescriptions = [...descriptions];
    newDescriptions[index] = value;
    setDescriptions(newDescriptions);
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong>
          Descriptions ({descriptions.filter(d => d.trim()).length}/{maxDescriptions})
        </Text>
        <Text type="secondary" style={{ marginLeft: 8 }}>
          <InfoCircleOutlined style={{ marginRight: 4 }} />
          Provide variety for Google's AI to test
        </Text>
      </div>
      
      {descriptions.map((description, index) => (
        <Form.Item
          key={index}
          name={`description${index + 1}`}
          label={`Description ${index + 1} ${index < minDescriptions ? '*' : ''}`}
          rules={[
            {
              required: index < minDescriptions,
              message: `Description ${index + 1} is required`
            },
            {
              max: 90,
              message: 'Descriptions must be 90 characters or less'
            }
          ]}
          style={{ marginBottom: 16 }}
        >
          <Space.Compact style={{ display: 'flex' }}>
            <TextArea
              rows={2}
              placeholder={
                index === 0 
                  ? "Get the best industrial equipment from trusted brands. Free consultation available."
                  : index === 1
                  ? "Expert support and competitive pricing on all industrial solutions."
                  : "Professional-grade equipment with worldwide shipping and warranty."
              }
              maxLength={90}
              showCount
              value={description}
              onChange={(e) => updateDescription(index, e.target.value)}
              style={{ flex: 1 }}
            />
            {descriptions.length > minDescriptions && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeDescription(index)}
                style={{ flexShrink: 0, alignSelf: 'flex-start', marginTop: 8 }}
              />
            )}
          </Space.Compact>
        </Form.Item>
      ))}
      
      {descriptions.length < maxDescriptions && (
        <Button
          type="dashed"
          onClick={addDescription}
          icon={<PlusOutlined />}
          style={{ marginBottom: 16 }}
        >
          Add Description ({descriptions.length}/{maxDescriptions})
        </Button>
      )}
    </div>
  );
};

export default MultipleDescriptionsInput;




