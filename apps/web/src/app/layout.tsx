import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PHANTOMS — build with a clear stack',
  description: 'A free, Bun-first learning stack for modern applications.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
