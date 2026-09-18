import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Spec 2: Inter, loaded and self-hosted by Next so there is no wait on Google.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dabz System",
  description:
    "Business management system for Dabz Printshoppe, Dabz Apparel and DabzTech Solutions.",
};

export const viewport: Viewport = {
  // The top bar is black in both themes, so the phone's status bar should be too.
  themeColor: "#000000",
};

/*
  Sets the theme before the first paint so the screen never flashes the wrong
  colour. Dark is the default the owner chose (open decision 17.4); a saved
  choice from the theme switch wins over it.
*/
const themeScript = `
(function () {
  try {
    var saved = localStorage.getItem('dabz-theme');
    var theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
