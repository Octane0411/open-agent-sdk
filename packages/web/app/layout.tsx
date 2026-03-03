import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Open Agent SDK',
  description: 'Product home for Open Agent SDK with Docs, Blog, and Playground.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
