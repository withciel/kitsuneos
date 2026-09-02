import type { Metadata } from 'next';
import '@kitsuneos/ui/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'KitsuneOS Console',
  description: 'Review agent-proposed changes before they land.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
