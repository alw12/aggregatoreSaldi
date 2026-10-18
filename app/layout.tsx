import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Font nel repo (OFL, sottoinsieme latin): la build non dipende da Google Fonts
const sans = localFont({ src: "./fonts/HankenGrotesk-Variable.woff2", weight: "100 900", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Saldi",
  description: "Tutti i conti in un posto",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Saldi", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

// Prima del primo disegno: applica "nascondi importi" salvato da PrivacyToggle (app/privacy.tsx)
const PRIVACY_BOOT = `try{if(localStorage.getItem("saldi:private")==="1")document.documentElement.dataset.private="1"}catch(e){}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // la barra in basso usa env(safe-area-inset-bottom)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1412" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-private è impostato dallo script prima di React
    <html lang="it" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRIVACY_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
