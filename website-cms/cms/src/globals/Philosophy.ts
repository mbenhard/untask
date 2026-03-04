import type { GlobalConfig } from 'payload'

export const Philosophy: GlobalConfig = {
  slug: 'philosophy',
  label: 'Philosophy',
  admin: {
    description: 'Philosophy section — design principles and values',
  },
  access: { read: () => true },
  fields: [
    {
      type: 'collapsible',
      label: 'Section Header',
      admin: { initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'sectionNumber',
              type: 'text',
              label: 'Number',
              defaultValue: '06',
              admin: { width: '20%', description: 'e.g. "06"' },
            },
            {
              name: 'sectionHeading',
              type: 'text',
              label: 'Heading',
              defaultValue: 'Built for One Person',
              admin: { width: '80%' },
            },
          ],
        },
        {
          name: 'sectionDescription',
          type: 'textarea',
          label: 'Description',
          admin: { description: 'Intro text shown above the principles list' },
        },
      ],
    },
    {
      name: 'principles',
      type: 'array',
      label: 'Principles',
      admin: {
        description: 'Core design principles displayed as a list',
        initCollapsed: true,
      },
      labels: { singular: 'Principle', plural: 'Principles' },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
          label: 'Label',
          admin: { description: 'Short principle name (e.g. "Local-first")' },
        },
        {
          name: 'description',
          type: 'textarea',
          required: true,
          label: 'Description',
          admin: { description: 'Explanation of this principle' },
        },
      ],
    },
  ],
}
