import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { WalletProvider } from '@/components/WalletProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'SolAgar | High-Stakes Solana Multiplayer Arena',
  description:
    'Eat cells, absorb SOL bounties, and survive the 5-second Cash-Out channel in real-time on Solana.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`}>
      <body className="font-sans antialiased bg-[#07090e] text-slate-100 min-h-screen">
        <WalletProvider>{children}</WalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
