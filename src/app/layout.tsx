import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'GymOS Super Admin', template: '%s · GymOS' },
  description: 'GymOS platform operator console',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Not capping maximumScale: pinch-zoom is an accessibility feature, not a layout bug.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
