import type { GlobalConfig } from 'payload'

export const TechStack: GlobalConfig = {
  slug: 'tech-stack',
  label: 'Tech Stack',
  admin: {
    description: 'Tech stack section — tools and libraries used',
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
              defaultValue: '07',
              admin: { width: '20%', description: 'e.g. "07"' },
            },
            {
              name: 'sectionHeading',
              type: 'text',
              label: 'Heading',
              defaultValue: 'Under the Hood',
              admin: { width: '80%' },
            },
          ],
        },
        {
          name: 'sectionDescription',
          type: 'textarea',
          label: 'Description',
          admin: { description: 'Intro text shown above the tech stack list' },
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      label: 'Stack Items',
      admin: {
        description: 'Technology stack entries displayed as label-value pairs',
        initCollapsed: true,
      },
      labels: { singular: 'Item', plural: 'Items' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'label',
              type: 'text',
              required: true,
              label: 'Label',
              admin: { width: '30%', description: 'Category (e.g. "Runtime")' },
            },
            {
              name: 'value',
              type: 'text',
              required: true,
              label: 'Value',
              admin: { width: '70%', description: 'Technology (e.g. "Electron + React")' },
            },
          ],
        },
      ],
    },
  ],
}
