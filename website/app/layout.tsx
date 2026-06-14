import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inkwell — faceless video that actually gets watched',
  description:
    'Inkwell builds long-form faceless YouTube videos with custom-rendered animation and retention-engineered scripts — the opposite of the AI slop YouTube now demonetizes.',
  openGraph: {
    title: 'Inkwell — faceless video that actually gets watched',
    description:
      'Custom-rendered animation, retention-engineered scripts, a distinct look for every channel. Not stock-footage slop.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
