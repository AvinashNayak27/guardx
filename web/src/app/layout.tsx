import type { Metadata } from "next";
import { VT323, JetBrains_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";

/* VT323 - retro terminal / dotted digital aesthetic */
const vt323 = VT323({
  variable: "--font-vt323",
  subsets: ["latin"],
  weight: "400",
});

/* Press Start 2P - 8-bit pixel/dotted style for headers */
const pressStart = Press_Start_2P({
  variable: "--font-dotted",
  subsets: ["latin"],
  weight: "400",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "DC Explorer - Verifiable Audit Agent",
  description: "Audit Docker image code for mnemonic exposure and security risks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${vt323.variable} ${pressStart.variable} ${jetbrainsMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-jetbrains), JetBrains Mono, monospace" }}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('dc-explorer-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',s||(d?'dark':'light'));})();`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
