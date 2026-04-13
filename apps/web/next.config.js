/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  transpilePackages: ['@huoziwriter/core', '@huoziwriter/db', '@huoziwriter/rendering', '@huoziwriter/ui'],
}

module.exports = nextConfig
