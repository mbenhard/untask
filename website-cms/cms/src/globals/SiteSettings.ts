import type { GlobalConfig } from 'payload'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  admin: {
    description: 'Global site configuration, SEO defaults, and analytics',
  },
  access: { read: () => true },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'General',
          fields: [
            {
              name: 'siteName',
              type: 'text',
              required: true,
              label: 'Site Name',
              admin: { description: 'Used in the footer and browser tab' },
            },
            {
              name: 'siteUrl',
              type: 'text',
              required: true,
              label: 'Site URL',
              admin: { description: 'Production URL (e.g. https://unta.sk)' },
              validate: (val: string | null | undefined) => {
                if (val && !val.startsWith('http')) return 'Must be a full URL starting with http'
                return true
              },
            },
            {
              name: 'version',
              type: 'text',
              label: 'Current Version',
              admin: { description: 'Displayed in the footer (e.g. v0.1.15)' },
            },
            {
              name: 'githubRepo',
              type: 'text',
              label: 'GitHub Repo URL',
              admin: { description: 'Link to the source repository' },
            },
          ],
        },
        {
          label: 'SEO',
          fields: [
            {
              name: 'defaultTitle',
              type: 'text',
              label: 'Default Page Title',
              admin: { description: 'Fallback <title> when pages don\'t specify one' },
            },
            {
              name: 'defaultDescription',
              type: 'textarea',
              label: 'Default Meta Description',
              admin: { description: 'Fallback meta description for SEO' },
            },
            {
              name: 'ogImage',
              type: 'upload',
              relationTo: 'media',
              label: 'Default OG Image',
              admin: { description: 'Default social sharing image (1200x630 recommended)' },
            },
          ],
        },
        {
          label: 'Analytics',
          fields: [
            {
              name: 'googleAnalyticsId',
              type: 'text',
              label: 'Google Analytics ID',
              admin: { description: 'Measurement ID (e.g. G-XXXXXXXXXX)' },
              validate: (val: string | null | undefined) => {
                if (val && !/^G-[A-Z0-9]+$/.test(val)) return 'Must be a valid GA4 ID (e.g. G-V1YT9TKX3P)'
                return true
              },
            },
          ],
        },
      ],
    },
  ],
}
