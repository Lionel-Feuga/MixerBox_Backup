import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Mes playlists',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#1f2226' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
