import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import { Users } from './src/collections/Users'
import { Media } from './src/collections/Media'
import { Homepage } from './src/globals/Homepage'
import { SiteSettings } from './src/globals/SiteSettings'
import { Philosophy } from './src/globals/Philosophy'
import { TechStack } from './src/globals/TechStack'
import { Download } from './src/globals/Download'
import { Privacy } from './src/globals/Privacy'
import { Support } from './src/globals/Support'
import { Footer } from './src/globals/Footer'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'default-secret-change-me',

  admin: {
    meta: {
      titleSuffix: ' — Untask CMS',
    },
    livePreview: {
      globals: ['homepage', 'support', 'privacy', 'footer', 'philosophy', 'tech-stack', 'download'],
      url: ({ globalSlug }) => {
        const base = process.env.ASTRO_URL || 'http://localhost:4321'
        const routes: Record<string, string> = {
          homepage: '/',
          support: '/support',
          privacy: '/privacy',
          footer: '/',
          philosophy: '/',
          'tech-stack': '/',
          download: '/',
        }
        return `${base}${routes[globalSlug ?? ''] ?? '/'}`
      },
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 375, height: 667 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1280, height: 900 },
      ],
    },
  },

  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || 'file:./payload.db',
    },
  }),

  editor: lexicalEditor(),

  collections: [Users, Media],

  globals: [
    // Pages
    { ...Homepage, admin: { ...Homepage.admin, group: 'Pages' } },
    { ...Privacy, admin: { ...Privacy.admin, group: 'Pages' } },
    { ...Support, admin: { ...Support.admin, group: 'Pages' } },
    // Sections
    { ...Philosophy, admin: { ...Philosophy.admin, group: 'Sections' } },
    { ...TechStack, admin: { ...TechStack.admin, group: 'Sections' } },
    { ...Download, admin: { ...Download.admin, group: 'Sections' } },
    // Site
    { ...SiteSettings, admin: { ...SiteSettings.admin, group: 'Site' } },
    { ...Footer, admin: { ...Footer.admin, group: 'Site' } },
  ],

  cors: [
    'http://localhost:4321', // Astro dev server
    'http://localhost:3000',
  ],

  csrf: [
    'http://localhost:4321',
    'http://localhost:3000',
  ],

  typescript: {
    outputFile: path.resolve(dirname, 'src/payload-types.ts'),
  },
})
