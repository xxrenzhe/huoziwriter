const { existsSync } = require("node:fs")
const { resolve } = require("node:path")

const repoEnvPath = resolve(__dirname, "../../.env")
if (existsSync(repoEnvPath)) {
  process.loadEnvFile(repoEnvPath)
}

const isStandaloneBuild = process.env.NEXT_OUTPUT_MODE === 'standalone'
const distDir = process.env.NEXT_DIST_DIR ? String(process.env.NEXT_DIST_DIR) : undefined

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir,
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
