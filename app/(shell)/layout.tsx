import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell/AppShell';
import '@/components/AppShell/appshell.css';

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
