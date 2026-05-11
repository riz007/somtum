import { defineConfig } from 'vitepress'

const enNav = [
  { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
  { text: 'Reference', link: '/reference/cli', activeMatch: '/reference/' },
  { text: 'Troubleshooting', link: '/troubleshooting' },
  {
    text: 'v2.0.0',
    items: [
      { text: 'Changelog', link: 'https://github.com/riz007/somtum/blob/main/CHANGELOG.md' },
      { text: 'npm', link: 'https://www.npmjs.com/package/somtum' },
    ],
  },
]

const enSidebar = [
  {
    text: 'Guide',
    items: [
      { text: 'Introduction', link: '/' },
      { text: 'Getting Started', link: '/guide/getting-started' },
      { text: 'How It Works', link: '/guide/how-it-works' },
      { text: 'Limitations', link: '/guide/limitations' },
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
]

const thNav = [
  { text: 'คู่มือ', link: '/th/guide/getting-started', activeMatch: '/th/guide/' },
  { text: 'เอกสารอ้างอิง', link: '/th/reference/cli', activeMatch: '/th/reference/' },
  { text: 'การแก้ปัญหา', link: '/th/troubleshooting' },
  {
    text: 'v2.0.0',
    items: [
      { text: 'บันทึกการเปลี่ยนแปลง', link: 'https://github.com/riz007/somtum/blob/main/CHANGELOG.md' },
      { text: 'npm', link: 'https://www.npmjs.com/package/somtum' },
    ],
  },
]

const thSidebar = [
  {
    text: 'คู่มือ',
    items: [
      { text: 'บทนำ', link: '/th/' },
      { text: 'เริ่มต้นใช้งาน', link: '/th/guide/getting-started' },
      { text: 'วิธีการทำงาน', link: '/th/guide/how-it-works' },
      { text: 'ข้อจำกัด', link: '/th/guide/limitations' },
    ],
  },
  {
    text: 'เอกสารอ้างอิง',
    items: [
      { text: 'เอกสาร CLI', link: '/th/reference/cli' },
      { text: 'การตั้งค่า', link: '/th/reference/configuration' },
      { text: 'เซิร์ฟเวอร์ MCP', link: '/th/reference/mcp-server' },
      { text: 'โครงสร้างที่จัดเก็บ', link: '/th/reference/storage' },
    ],
  },
  {
    text: 'คุณสมบัติ',
    items: [
      { text: 'แดชบอร์ด', link: '/th/features/dashboard' },
      { text: 'ความเป็นส่วนตัวและประสิทธิภาพ', link: '/th/features/privacy' },
    ],
  },
  {
    text: 'การสนับสนุน',
    items: [
      { text: 'การแก้ปัญหา', link: '/th/troubleshooting' },
      { text: 'การมีส่วนร่วม', link: '/th/contributing' },
    ],
  },
]

const bnNav = [
  { text: 'গাইড', link: '/bn/guide/getting-started', activeMatch: '/bn/guide/' },
  { text: 'রেফারেন্স', link: '/bn/reference/cli', activeMatch: '/bn/reference/' },
  { text: 'সমস্যা সমাধান', link: '/bn/troubleshooting' },
  {
    text: 'v2.0.0',
    items: [
      { text: 'পরিবর্তনলগ', link: 'https://github.com/riz007/somtum/blob/main/CHANGELOG.md' },
      { text: 'npm', link: 'https://www.npmjs.com/package/somtum' },
    ],
  },
]

const bnSidebar = [
  {
    text: 'গাইড',
    items: [
      { text: 'পরিচিতি', link: '/bn/' },
      { text: 'শুরু করা', link: '/bn/guide/getting-started' },
      { text: 'এটি কীভাবে কাজ করে', link: '/bn/guide/how-it-works' },
      { text: 'সীমাবদ্ধতা', link: '/bn/guide/limitations' },
    ],
  },
  {
    text: 'রেফারেন্স',
    items: [
      { text: 'CLI রেফারেন্স', link: '/bn/reference/cli' },
      { text: 'কনফিগারেশন', link: '/bn/reference/configuration' },
      { text: 'MCP সার্ভার', link: '/bn/reference/mcp-server' },
      { text: 'স্টোরেজ লেআউট', link: '/bn/reference/storage' },
    ],
  },
  {
    text: 'বৈশিষ্ট্য',
    items: [
      { text: 'ড্যাশবোর্ড', link: '/bn/features/dashboard' },
      { text: 'গোপনীয়তা ও কার্যকারিতা', link: '/bn/features/privacy' },
    ],
  },
  {
    text: 'সহায়তা',
    items: [
      { text: 'সমস্যা সমাধান', link: '/bn/troubleshooting' },
      { text: 'অবদান', link: '/bn/contributing' },
    ],
  },
]

export default defineConfig({
  title: 'Somtum',
  description: 'Local-first memory and prompt-cache layer for Claude Code.',
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

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        editLink: {
          pattern: 'https://github.com/riz007/somtum/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026 Rizwanul Islam Rudra',
        },
        docFooter: {
          prev: 'Previous',
          next: 'Next',
        },
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light mode',
        darkModeSwitchTitle: 'Switch to dark mode',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Return to top',
        langMenuLabel: 'Change language',
        outlineTitle: 'On this page',
      },
    },

    th: {
      label: 'ภาษาไทย',
      lang: 'th',
      link: '/th/',
      themeConfig: {
        nav: thNav,
        sidebar: thSidebar,
        editLink: {
          pattern: 'https://github.com/riz007/somtum/edit/main/docs/:path',
          text: 'แก้ไขหน้านี้บน GitHub',
        },
        footer: {
          message: 'เผยแพร่ภายใต้ใบอนุญาต MIT',
          copyright: 'ลิขสิทธิ์ © 2026 Rizwanul Islam Rudra',
        },
        docFooter: {
          prev: 'ก่อนหน้า',
          next: 'ถัดไป',
        },
        darkModeSwitchLabel: 'รูปลักษณ์',
        lightModeSwitchTitle: 'สลับเป็นโหมดสว่าง',
        darkModeSwitchTitle: 'สลับเป็นโหมดมืด',
        sidebarMenuLabel: 'เมนู',
        returnToTopLabel: 'กลับสู่ด้านบน',
        langMenuLabel: 'เปลี่ยนภาษา',
        outlineTitle: 'บนหน้านี้',
      },
    },

    bn: {
      label: 'বাংলা',
      lang: 'bn',
      link: '/bn/',
      themeConfig: {
        nav: bnNav,
        sidebar: bnSidebar,
        editLink: {
          pattern: 'https://github.com/riz007/somtum/edit/main/docs/:path',
          text: 'GitHub-এ এই পৃষ্ঠাটি সম্পাদনা করুন',
        },
        footer: {
          message: 'MIT লাইসেন্সের অধীনে প্রকাশিত।',
          copyright: 'কপিরাইট © 2026 Rizwanul Islam Rudra',
        },
        docFooter: {
          prev: 'পূর্ববর্তী',
          next: 'পরবর্তী',
        },
        darkModeSwitchLabel: 'চেহারা',
        lightModeSwitchTitle: 'লাইট মোডে স্যুইচ করুন',
        darkModeSwitchTitle: 'ডার্ক মোডে স্যুইচ করুন',
        sidebarMenuLabel: 'মেনু',
        returnToTopLabel: 'শীর্ষে ফিরুন',
        langMenuLabel: 'ভাষা পরিবর্তন করুন',
        outlineTitle: 'এই পৃষ্ঠায়',
      },
    },
  },

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Somtum',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/riz007/somtum' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/somtum' },
    ],

    search: {
      provider: 'local',
    },
  },
})
