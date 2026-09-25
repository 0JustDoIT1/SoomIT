import type { Metadata } from 'next';
import { AppToastProvider } from '@/components/ui/toast/toast-provider';
import { CLINICIAN_THEME_BOOTSTRAP_SCRIPT } from '@/components/theme/clinician-theme';
import './globals.css';

export const metadata: Metadata = {
  title: '숨잇 - 폐암 진단 CDSS',
  description: '숨잇, 진단부터 처방까지',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CLINICIAN_THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <AppToastProvider />
      </body>
    </html>
  );
}
