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
  // Dev-only: lets an ngrok tunnel's HMR/dev-resource requests through.
  // ngrok's free plan gives a new random subdomain each restart, so this
  // is a wildcard rather than one fixed hostname — remove once the app is
  // actually deployed, since this setting has no effect outside `next dev`.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app"],
};

export default nextConfig;
