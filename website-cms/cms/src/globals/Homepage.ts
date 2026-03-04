import type { GlobalConfig } from 'payload'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'Homepage',
  admin: {
    description: 'Hero section and numbered content sections for the landing page',
  },
  access: { read: () => true },
  versions: {
    drafts: true,
    max: 10,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Hero',
          fields: [
            {
              name: 'hero',
              type: 'group',
              label: ' ',
              admin: { hideGutter: true },
              fields: [
                {
                  name: 'title',
                  type: 'text',
                  required: true,
                  label: 'Title',
                  admin: { description: 'Main headline displayed in the hero area' },
                },
                {
                  name: 'subtitle',
                  type: 'textarea',
                  required: true,
                  label: 'Subtitle',
                  admin: { description: 'Supporting text below the title' },
                },
                {
                  name: 'tagline',
                  type: 'text',
                  label: 'Tagline',
                  admin: { description: 'Short tagline shown below the CTAs (e.g. "Free · MIT Licensed · macOS only")' },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'ctaText',
                      type: 'text',
                      label: 'Primary CTA Text',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'ctaLink',
                      type: 'text',
                      label: 'Primary CTA Link',
                      admin: { width: '50%' },
                      validate: (val: string | null | undefined) => {
                        if (val && !val.startsWith('/') && !val.startsWith('#') && !val.startsWith('http')) {
                          return 'Must be a URL, anchor (#), or path (/)'
                        }
                        return true
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'secondaryCtaText',
                      type: 'text',
                      label: 'Secondary CTA Text',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'secondaryCtaLink',
                      type: 'text',
                      label: 'Secondary CTA Link',
                      admin: { width: '50%' },
                      validate: (val: string | null | undefined) => {
                        if (val && !val.startsWith('/') && !val.startsWith('#') && !val.startsWith('http')) {
                          return 'Must be a URL, anchor (#), or path (/)'
                        }
                        return true
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Sections',
          fields: [
            {
              name: 'sections',
              type: 'array',
              label: 'Content Sections',
              admin: {
                description: 'Numbered sections displayed below the hero',
                initCollapsed: true,
              },
              labels: { singular: 'Section', plural: 'Sections' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'number',
                      type: 'text',
                      required: true,
                      label: 'Number',
                      admin: { width: '20%', description: 'e.g. "01"' },
                    },
                    {
                      name: 'sectionId',
                      type: 'text',
                      required: true,
                      label: 'Section ID',
                      admin: { width: '30%', description: 'URL anchor (e.g. "inbox")' },
                    },
                    {
                      name: 'heading',
                      type: 'text',
                      required: true,
                      label: 'Heading',
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  name: 'description',
                  type: 'textarea',
                  label: 'Description',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
