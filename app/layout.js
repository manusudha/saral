import { ClerkProvider } from "@clerk/nextjs";
import './globals.css';
import Providers from './providers';
import PwaRegister from './PwaRegister';

export const viewport = {
  themeColor: '#002970',
};

export const metadata = {
  title: 'Saral — financial journeys in one conversation',
  description: 'Paytm Build for India AI Hackathon · Track 2 prototype',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Saral',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">
        <ClerkProvider>
          <PwaRegister />
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}