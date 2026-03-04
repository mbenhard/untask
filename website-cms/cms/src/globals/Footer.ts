import type { GlobalConfig } from 'payload'

export const Footer: GlobalConfig = {
  slug: 'footer',
  label: 'Footer',
  admin: {
    description: 'Footer navigation links and sign-off',
  },
  access: { read: () => true },
  fields: [
    {
      name: 'navLinks',
      type: 'array',
      label: 'Navigation Links',
      admin: {
        description: 'Links shown in the footer navigation',
        initCollapsed: true,
      },
      labels: { singular: 'Link', plural: 'Links' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'label',
              type: 'text',
              required: true,
              label: 'Label',
              admin: { width: '40%' },
            },
            {
              name: 'href',
              type: 'text',
              required: true,
              label: 'URL',
              admin: { width: '60%' },
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
    {
      name: 'signoff',
      type: 'group',
      label: 'Sign-off',
      admin: { description: 'The closing message in the footer' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'signoffText',
              type: 'text',
              label: 'Text',
              admin: { width: '33%', description: 'e.g. "Love from"' },
            },
            {
              name: 'signoffName',
              type: 'text',
              label: 'Name',
              admin: { width: '33%', description: 'e.g. "Marcus"' },
            },
            {
              name: 'signoffLink',
              type: 'text',
              label: 'Link',
              admin: { width: '33%' },
              validate: (val: string | null | undefined) => {
                if (val && !val.startsWith('/') && !val.startsWith('http')) {
                  return 'Must be a URL or path (/)'
                }
                return true
              },
            },
          ],
        },
      ],
    },
  ],
}
