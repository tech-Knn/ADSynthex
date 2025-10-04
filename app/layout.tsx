import '../styles/globals.css';
import { Inter } from 'next/font/google';
import AntdProvider from '../components/Providers/AntdProvider';
import type { Metadata } from 'next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AdSyntheX - Dashboard',
  description: 'Combining Ads.com revenue data with Google Ads cost data',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AntdProvider>
          {children}
        </AntdProvider>
      </body>
    </html>
  );
} 