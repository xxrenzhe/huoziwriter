const isStandaloneBuild = process.env.NEXT_OUTPUT_MODE === 'standalone'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isStandaloneBuild ? 'standalone' : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  experimental: {
    webpackBuildWorker: false,
  },
  transpilePackages: ['@huoziwriter/core', '@huoziwriter/db', '@huoziwriter/rendering', '@huoziwriter/ui'],
}

module.exports = nextConfig
