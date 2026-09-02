import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import { AppShell } from "../components/layout/AppShell";
import { PlayerProvider } from "../components/player/PlayerProvider";
import { GlobalMiniPlayer } from "../components/player/GlobalMiniPlayer";
import { DownloadDialog } from "../components/player/DownloadDialog";

export const metadata: Metadata = {
  title: "StreamMusic",
  description: "Music streaming and download via provider layers",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'light' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: light)').matches)) {
                  document.documentElement.classList.remove('dark')
                } else {
                  document.documentElement.classList.add('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
          <PlayerProvider />
          <GlobalMiniPlayer />
          <DownloadDialog />
        </Providers>
      </body>
    </html>
  );
}
