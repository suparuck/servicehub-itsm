import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from 'next/font/google';
import { th } from '@/i18n/th';
import './globals.css';

const sans = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = { title: `${th.app.name} — แดชบอร์ด ITSM` };

// layout หลักมีเฉพาะ <html>/ฟอนต์ — โครงหน้าแยกเป็น route group: (app) = เจ้าหน้าที่มี sidebar, (portal) = พอร์ทัลผู้ใช้
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
