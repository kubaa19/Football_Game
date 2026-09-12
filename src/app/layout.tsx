import type { Metadata } from 'next';
import './globals.css';
import AnalyticsProvider from '@/components/AnalyticsProvider';

export const metadata: Metadata = {
  title: 'FootQuiz',
  description: 'Codzienny quiz piłkarski',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>{children}<AnalyticsProvider /></body>
    </html>
  );
}