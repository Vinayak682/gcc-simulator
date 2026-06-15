import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Al Manar Industries — GCC Business Simulator',
  description:
    'Run Al Manar Industries as MD/CEO. 8 autonomous AI agents advise in real time. ' +
    'DFM-listed FMCG company with GCC market mechanics. ProductHunt Launch Edition.',
  keywords: [
    'business simulator',
    'GCC',
    'Dubai',
    'FMCG',
    'AI agents',
    'business strategy simulator',
    'DFM',
  ],
  openGraph: {
    title: 'Al Manar Industries — GCC Business Simulator',
    description:
      'The first Dubai-listed FMCG business simulator with 8 autonomous AI agents.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#08080f] text-white`}
      >
        {children}
      </body>
    </html>
  );
}
