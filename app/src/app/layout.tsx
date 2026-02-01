import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components";
import { PrivacyCashProvider } from "@/contexts/PrivacyCashContext";
import { PrivateMasterProvider } from "@/contexts/PrivateMasterContext";
import { AgentNamesProvider } from "@/contexts/AgentNamesContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Cloaked - Trustless AI Agent Spending",
  description: "Trustless spending accounts for AI agents on Solana. On-chain enforced limits they literally cannot bypass.",
  metadataBase: new URL("https://cloakedagent.com"),
  openGraph: {
    title: "Cloaked - Trustless AI Agent Spending",
    description: "Trustless spending accounts for AI agents on Solana. On-chain enforced limits they literally cannot bypass.",
    url: "https://cloakedagent.com",
    siteName: "Cloaked",
    images: [
      {
        url: "/images/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Cloaked - Trustless AI Agent Spending",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cloaked - Trustless AI Agent Spending",
    description: "Trustless spending accounts for AI agents on Solana. On-chain enforced limits they literally cannot bypass.",
    images: ["/images/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased min-h-screen font-sans">
        <WalletProvider>
          <PrivateMasterProvider>
            <PrivacyCashProvider>
              <AgentNamesProvider>
                <main>{children}</main>
              </AgentNamesProvider>
            </PrivacyCashProvider>
          </PrivateMasterProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
