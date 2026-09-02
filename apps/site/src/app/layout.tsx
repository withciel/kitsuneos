import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KitsuneOS — Agents propose. You approve.',
  description: 'A database layer where agents propose changes and humans approve them.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
