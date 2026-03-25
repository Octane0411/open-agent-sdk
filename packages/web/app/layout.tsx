import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Open Agent SDK | Open-source agent runtime for TypeScript teams',
  description:
    'Lightweight, general-purpose TypeScript agent runtime. Open-source alternative to Claude Agent SDK.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
