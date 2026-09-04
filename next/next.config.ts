import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Trims the production image to only what `node server.js` needs
  // (.next/standalone). Required by the Dockerfile's runner stage.
  output: 'standalone',
  serverExternalPackages: ["tesseract.js"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
