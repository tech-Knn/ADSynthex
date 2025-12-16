'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/Layout/DashboardLayout';

// Declare custom window property for TypeScript
declare global {
  interface Window {
    __selectedCustomerId?: string | null;
  }
}

// Create a context for sharing account state
export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Initialize the selected customer ID on mount
  useEffect(() => {
    // Set initial value to null (all accounts)
    if (typeof window !== 'undefined') {
      window.__selectedCustomerId = null;
    }
  }, []);

  const handleAccountChange = (customerId: string | null) => {
    console.log('Account changed in layout:', customerId);
    setSelectedCustomerId(customerId);
    
    // Pass the selected account ID to children via global window property
    if (typeof window !== 'undefined') {
      window.__selectedCustomerId = customerId;
      
      // Dispatch a custom event that the page component can listen for
      const event = new CustomEvent('accountChanged', { detail: customerId });
      window.dispatchEvent(event);
    }
  };

  return (
    <DashboardLayout 
      onAccountChange={handleAccountChange}
      selectedAccountId={selectedCustomerId ? `CID_${selectedCustomerId}` : 'all'}
    >
      {children}
    </DashboardLayout>
  );
} 