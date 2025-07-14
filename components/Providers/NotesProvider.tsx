'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { message } from 'antd';

// Types for a note record returned by the API
export interface NoteRecord {
  id: string;
  slug: string;
  text: string;
  updated_at: string;
}

interface NotesContextType {
  notesMap: Record<string, NoteRecord>;
  saveNote: (slug: string, text: string) => Promise<void>;
  deleteNote: (slug: string) => Promise<void>;
}

const NotesContext = createContext<NotesContextType>({
  notesMap: {},
  saveNote: async () => {},
  deleteNote: async () => {},
});

export const useNotes = () => useContext(NotesContext);

export default function NotesProvider({ children }: { children: React.ReactNode }) {
  const [notesMap, setNotesMap] = useState<Record<string, NoteRecord>>({});

  // Fetch all notes once on mount
  useEffect(() => {
    fetch('/api/notes', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch notes');
        const data = await res.json();
        const map: Record<string, NoteRecord> = {};
        (data.notes || []).forEach((note: NoteRecord) => {
          map[note.slug] = note;
        });
        setNotesMap(map);
      })
      .catch((err) => {
        console.error(err);
        // Silent fail – notes are optional
      });
  }, []);

  // Save or update a note
  const saveNote = async (slug: string, text: string) => {
    try {
      const existing = notesMap[slug];
      const method = existing ? 'PUT' : 'POST';
      const body = existing ? { id: existing.id, text } : { slug, text };

      const res = await fetch('/api/notes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Request failed');
      const note: NoteRecord = await res.json();
      setNotesMap((prev) => ({ ...prev, [slug]: note }));
      message.success('Note saved');
    } catch (err) {
      console.error(err);
      message.error('Failed to save note');
    }
  };

  // Delete a note
  const deleteNote = async (slug: string) => {
    try {
      const existing = notesMap[slug];
      if (!existing) return;

      const res = await fetch(`/api/notes?id=${existing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Request failed');

      setNotesMap((prev) => {
        const { [slug]: _, ...rest } = prev;
        return rest;
      });
      message.success('Note deleted');
    } catch (err) {
      console.error(err);
      message.error('Failed to delete note');
    }
  };

  return (
    <NotesContext.Provider value={{ notesMap, saveNote, deleteNote }}>
      {children}
    </NotesContext.Provider>
  );
} 