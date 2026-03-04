import type { GlobalConfig } from 'payload'

export const Support: GlobalConfig = {
  slug: 'support',
  label: 'Support / FAQ',
  admin: {
    description: 'Support page content, contact channels, and FAQ items',
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
          admin: { description: 'Main heading on the support page' },
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
      name: 'contactChannels',
      type: 'group',
      label: 'Contact Channels',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'contactEmail',
              type: 'email',
              label: 'Contact Email',
              admin: { width: '33%' },
            },
            {
              name: 'githubIssuesUrl',
              type: 'text',
              label: 'GitHub Issues URL',
              admin: { width: '33%' },
              validate: (val: string | null | undefined) => {
                if (val && !val.startsWith('http')) return 'Must be a full URL'
                return true
              },
            },
            {
              name: 'xDmUrl',
              type: 'text',
              label: 'X/Twitter DM URL',
              admin: { width: '33%' },
              validate: (val: string | null | undefined) => {
                if (val && !val.startsWith('http')) return 'Must be a full URL'
                return true
              },
            },
          ],
        },
      ],
    },
    {
      name: 'faqItems',
      type: 'array',
      label: 'FAQ Items',
      admin: {
        description: 'Frequently asked questions shown on the support page',
        initCollapsed: true,
      },
      labels: { singular: 'FAQ', plural: 'FAQs' },
      fields: [
        {
          name: 'anchorId',
          type: 'text',
          label: 'Anchor ID',
          admin: { description: 'URL hash for deep linking (e.g. "gatekeeper")' },
        },
        {
          name: 'question',
          type: 'text',
          required: true,
          label: 'Question',
        },
        {
          name: 'answer',
          type: 'textarea',
          label: 'Answer (plain text)',
          admin: { description: 'Plain text answer. Use "Answer HTML" below for formatted content.' },
        },
        {
          name: 'answerHtml',
          type: 'textarea',
          label: 'Answer (HTML)',
          admin: { description: 'HTML-formatted answer. Overrides plain text answer when present.' },
        },
        {
          name: 'code',
          type: 'text',
          label: 'Code Snippet',
          admin: { description: 'Terminal command displayed in a code block' },
        },
        {
          name: 'note',
          type: 'textarea',
          label: 'Note',
          admin: { description: 'Additional context shown below the answer' },
        },
      ],
    },
  ],
}
