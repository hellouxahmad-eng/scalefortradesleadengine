export const metadata = {
  title: 'Scale for Trades - Lead Engine',
  description: 'Scrape qualified HVAC and painting leads, track responses, manage campaigns',
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
