import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js"],
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/home",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
