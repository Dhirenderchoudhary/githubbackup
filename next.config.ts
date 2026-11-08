import type { NextConfig } from 'next'

const { VERCEL_GIT_PROVIDER, VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG } = process.env
const repoUrl = process.env.GITBACKUP_REPO_URL
  || (VERCEL_GIT_PROVIDER === 'github' && VERCEL_GIT_REPO_OWNER && VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}.git`
    : 'https://github.com/Dhirenderchoudhary/githubbackup.git')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  env: { GITBACKUP_REPO_URL: repoUrl },
}

export default nextConfig
