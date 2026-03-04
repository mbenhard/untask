import type { GlobalConfig } from 'payload'

export const Download: GlobalConfig = {
  slug: 'download',
  label: 'Download',
  admin: {
    description: 'Download section content and install commands',
  },
  access: { read: () => true },
  fields: [
    {
      name: 'heading',
      type: 'text',
      label: 'Heading',
      admin: { description: 'Main heading for the download section' },
    },
    {
      name: 'subheading',
      type: 'text',
      label: 'Subheading',
      admin: { description: 'Supporting text below the heading' },
    },
    {
      name: 'brewCommand',
      type: 'text',
      label: 'Brew Command',
      admin: { description: 'The `brew install` command users will copy' },
    },
    {
      type: 'collapsible',
      label: 'Advanced',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'xattrCommand',
          type: 'text',
          label: 'Xattr Command',
          admin: { description: 'Gatekeeper bypass command for direct downloads' },
        },
      ],
    },
  ],
}
