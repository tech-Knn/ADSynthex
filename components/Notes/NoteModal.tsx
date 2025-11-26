'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Input, Button, Space } from 'antd';

interface NoteModalProps {
  open: boolean;
  slug: string;
  initialText: string;
  onSave: (text: string) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

const { TextArea } = Input;

export default function NoteModal({ open, slug, initialText, onSave, onDelete, onCancel }: NoteModalProps) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  return (
    <Modal
      open={open}
      title={`Note for "${slug}"`}
      onCancel={onCancel}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onDelete && (
            <Button danger onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" onClick={() => onSave(text)}>
            Save
          </Button>
        </Space>
      }
    >
      <TextArea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter your note here..."
      />
    </Modal>
  );
} 