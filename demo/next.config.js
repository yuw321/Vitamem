/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['vitamem'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'vitamem': require('path').resolve(__dirname, '../src'),
    };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};
module.exports = nextConfig;
