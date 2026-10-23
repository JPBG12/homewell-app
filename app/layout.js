import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "HomeWell Inspections",
  description: "Inspection appointments and statuses for HomeWell Services",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "HomeWell", statusBarStyle: "black-translucent" },
};
export const viewport = { themeColor: "#1A1945", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
