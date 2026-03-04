import type { GlobalConfig } from 'payload'

export const Privacy: GlobalConfig = {
  slug: 'privacy',
  label: 'Privacy Policy',
  admin: {
    description: 'Privacy policy page content',
  },
  access: { read: () => true },
  versions: {
    drafts: true,
    max: 10,
  },
  fields: [
    {
      name: 'pageHeader',
      type: 'group',
      label: 'Page Header',
      fields: [
        {
          name: 'pageTitle',
          type: 'text',
          label: 'Title',
          admin: { description: 'Main heading on the privacy page' },
        },
        {
          name: 'pageSubtitle',
          type: 'text',
          label: 'Subtitle',
          admin: { description: 'Subheading below the title' },
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      label: 'Privacy Items',
      admin: {
        description: 'Each item is a labeled section of the privacy policy',
        initCollapsed: true,
      },
      labels: { singular: 'Item', plural: 'Items' },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
          label: 'Label',
          admin: { description: 'Section heading (e.g. "Your data", "Telemetry")' },
        },
        {
          name: 'detail',
          type: 'textarea',
          required: true,
          label: 'Detail',
          admin: { description: 'Explanation text for this section' },
        },
      ],
    },
  ],
}
