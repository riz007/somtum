import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Somtum',
  description: 'Local-first memory and prompt-cache layer for Claude Code.',
  // GitHub Pages URL: riz007.github.io/somtum/
  // Change to '/' if you deploy to a custom domain (e.g. docs.somtum.com)
  base: '/somtum/',
  appearance: 'dark',

  head: [
    ['link', { rel: 'icon', href: '/somtum/logo.png' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'canonical', href: 'https://riz007.github.io/somtum/' }],

    // SEO
    ['meta', { name: 'keywords', content: 'Claude Code, AI memory, developer tools, local SQLite, prompt cache, Claude, Anthropic, session memory' }],
    ['meta', { name: 'author', content: 'Rizwanul Islam Rudra' }],

    // Open Graph
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Somtum' }],
    ['meta', { property: 'og:title', content: 'Somtum — Local-first memory for Claude Code' }],
    ['meta', { property: 'og:description', content: 'Automatically captures decisions, bug fixes, and learnings from every Claude Code session — and injects them back on the next one. No cloud. No config. Just memory.' }],
    ['meta', { property: 'og:url', content: 'https://riz007.github.io/somtum/' }],
    ['meta', { property: 'og:image', content: 'https://riz007.github.io/somtum/logo.png' }],

    // Twitter / X card
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Somtum — Local-first memory for Claude Code' }],
    ['meta', { name: 'twitter:description', content: 'Automatically captures decisions, bug fixes, and learnings from every Claude Code session — and injects them back on the next one. No cloud. No config. Just memory.' }],
    ['meta', { name: 'twitter:image', content: 'https://riz007.github.io/somtum/logo.png' }],

    // Google Analytics
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-9621R7PP0X' }],
    ['script', {}, `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-9621R7PP0X');`],
  ],

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Somtum',

    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/cli', activeMatch: '/reference/' },
      { text: 'Troubleshooting', link: '/troubleshooting' },
      {
        text: 'v1.5.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/riz007/somtum/blob/main/CHANGELOG.md' },
          { text: 'npm', link: 'https://www.npmjs.com/package/somtum' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'How It Works', link: '/guide/how-it-works' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Reference', link: '/reference/cli' },
          { text: 'Configuration', link: '/reference/configuration' },
          { text: 'MCP Server', link: '/reference/mcp-server' },
          { text: 'Storage Layout', link: '/reference/storage' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Dashboard', link: '/features/dashboard' },
          { text: 'Privacy & Performance', link: '/features/privacy' },
        ],
      },
      {
        text: 'Support',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Contributing', link: '/contributing' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/riz007/somtum' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/somtum' },
    ],

    editLink: {
      pattern: 'https://github.com/riz007/somtum/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Rizwanul Islam Rudra',
    },

    search: {
      provider: 'local',
    },
  },
})
