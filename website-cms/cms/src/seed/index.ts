import { getPayload } from 'payload'
import config from '../../payload.config'

const seed = async () => {
  const payload = await getPayload({ config })

  console.log('Seeding database...')

  // Create admin user
  try {
    await payload.create({
      collection: 'users',
      data: {
        email: 'admin@untask.dev',
        password: 'changeme',
        name: 'Admin',
      },
    })
    console.log('Created admin user: admin@untask.dev / changeme')
  } catch {
    console.log('Admin user may already exist, skipping...')
  }

  // Seed Homepage
  await payload.updateGlobal({
    slug: 'homepage',
    data: {
      hero: {
        title: 'Untask',
        subtitle: 'A task manager that lives on your Mac and nowhere else. No cloud. No tracking. Free and open source.',
        ctaText: 'Download for macOS',
        ctaLink: '#download',
        secondaryCtaText: 'GitHub',
        secondaryCtaLink: 'https://github.com/mbenhard/untask',
        tagline: 'Free \u00b7 MIT Licensed \u00b7 macOS only',
      },
      sections: [
        {
          number: '01',
          heading: 'Fast by Default',
          description: 'A shortcut from anywhere drops you into the inbox. Type the task, hit Enter, keep going. Structure is optional. Add it when it earns its place.',
          sectionId: 'inbox',
        },
        {
          number: '02',
          heading: 'Lives in Apple Reminders Too',
          description: 'Two-way sync with macOS Reminders. Add tasks from Siri, Shortcuts, or any app that talks to Reminders. They show up here.',
          sectionId: 'reminders',
        },
        {
          number: '03',
          heading: 'Notes Live Here Too',
          description: 'Meeting notes, ideas, rough drafts. Same window, no context switch. Rich text and slash commands, stored locally alongside everything else.',
          sectionId: 'notes',
        },
        {
          number: '04',
          heading: 'AI That Actually Helps',
          description: 'Describe what you need. It creates tasks, moves things around, clears your plate. Confirms before anything destructive. Your key, your model, no middleman.',
          sectionId: 'chat',
        },
        {
          number: '05',
          heading: 'Mouse Not Required',
          description: 'Arrows to navigate, Space to complete, P to cycle priority, Enter to expand. Every action is a keypress. The mouse is there if you want it.',
          sectionId: 'keyboard',
        },
        {
          number: '06',
          heading: 'Built for One Person',
          description: 'Tested every task app I could find. None fit. Built this one for myself. Sharing it in case it fits you too.',
          sectionId: 'philosophy',
        },
        {
          number: '07',
          heading: 'Under the Hood',
          description: 'Electron shell, local SQLite, no cloud, no account. The stack is boring on purpose - fast, auditable, yours.',
          sectionId: 'techstack',
        },
      ],
      _status: 'published',
    },
  })
  console.log('Seeded: Homepage')

  // Seed Site Settings
  // Note: ogImage is now an upload field — upload an image via the admin panel after seeding
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      siteName: 'Untask',
      siteUrl: 'https://unta.sk',
      defaultTitle: 'Untask \u2014 Local-first task manager with an AI assistant',
      defaultDescription: 'A local-first personal task manager with an optional AI assistant. Open source, zero telemetry, MIT licensed.',
      googleAnalyticsId: 'G-V1YT9TKX3P',
      version: 'v0.1.15',
      githubRepo: 'https://github.com/mbenhard/untask',
    },
  })
  console.log('Seeded: Site Settings')

  // Seed Philosophy
  await payload.updateGlobal({
    slug: 'philosophy',
    data: {
      sectionNumber: '06',
      sectionHeading: 'Built for One Person',
      sectionDescription: 'Tested every task app I could find. None fit. Built this one for myself. Sharing it in case it fits you too.',
      principles: [
        {
          label: 'Local-first',
          description: 'Everything stays on your device. Zero telemetry, zero tracking. Your data never leaves your machine.',
        },
        {
          label: 'AI is optional',
          description: 'Use it as a pure task manager. Enable AI when you want it. Bring your own key from any provider.',
        },
        {
          label: 'Keyboard-first',
          description: 'Built for speed. Global shortcut to capture, keyboard navigation everywhere. No clicking required.',
        },
        {
          label: 'Open source',
          description: 'MIT licensed. Read every line of code. Fork it, extend it, make it yours.',
        },
        {
          label: 'Not a subscription',
          description: 'No recurring fee. No account. No server. Free and open source. You own it outright.',
        },
      ],
    },
  })
  console.log('Seeded: Philosophy')

  // Seed Tech Stack
  await payload.updateGlobal({
    slug: 'tech-stack',
    data: {
      sectionNumber: '07',
      sectionHeading: 'Under the Hood',
      sectionDescription: 'Electron shell, local SQLite, no cloud, no account. The stack is boring on purpose - fast, auditable, yours.',
      items: [
        { label: 'Runtime', value: 'Electron + React + TypeScript' },
        { label: 'Database', value: 'SQLite (better-sqlite3 + Drizzle)' },
        { label: 'AI', value: 'Vercel AI SDK, multi-provider' },
        { label: 'State', value: 'Zustand' },
        { label: 'Styling', value: 'Tailwind CSS' },
        { label: 'Editor', value: 'BlockNote' },
        { label: 'Storage', value: '~/Library/Application Support/Untask/' },
      ],
    },
  })
  console.log('Seeded: Tech Stack')

  // Seed Download
  await payload.updateGlobal({
    slug: 'download',
    data: {
      heading: 'Get Untask',
      subheading: 'Free, private, no account required.',
      brewCommand: 'brew install mbenhard/untask/untask',
      xattrCommand: 'xattr -cr /Applications/Untask.app',
    },
  })
  console.log('Seeded: Download')

  // Seed Privacy (pageTitle/pageSubtitle now nested under pageHeader group)
  await payload.updateGlobal({
    slug: 'privacy',
    data: {
      pageHeader: {
        pageTitle: "I don't want your data",
        pageSubtitle: "No accounts, no analytics, no cloud. That's the whole policy.",
      },
      items: [
        {
          label: 'Your data',
          detail: 'Everything lives in ~/Library/Application Support/Untask/ on your machine. Tasks, notes, conversations, attachments, backups \u2014 all local. There is no Untask cloud, no sync server, no backend.',
        },
        {
          label: 'Telemetry',
          detail: 'None. No analytics, no crash reporting, no usage tracking in the app. Zero.',
        },
        {
          label: 'Network requests',
          detail: "The app checks for updates on launch, when reopened, and every 6 hours in the background \u2014 a single request to GitHub (via a caching proxy) that sends no personal data. That's the only network call the app makes on its own.",
        },
        {
          label: 'AI providers',
          detail: 'If you enable AI, your task context and chat messages are sent to the provider you choose (OpenAI, Anthropic, OpenRouter, or local Ollama). You bring your own API key. Untask never sees your data \u2014 it goes directly from your machine to the provider.',
        },
        {
          label: 'API keys',
          detail: 'Stored locally with macOS Keychain encryption. Automatically stripped from backups when you export.',
        },
        {
          label: 'Ollama',
          detail: 'For fully offline AI \u2014 runs on your machine, nothing leaves it. No API key needed.',
        },
        {
          label: 'This website',
          detail: 'unta.sk uses Google Analytics for basic visitor stats. The app itself has no analytics whatsoever.',
        },
        {
          label: 'Source code',
          detail: 'MIT licensed and fully open source. Read every line, verify every claim.',
        },
      ],
      _status: 'published',
    },
  })
  console.log('Seeded: Privacy')

  // Seed Support (pageTitle/pageSubtitle under pageHeader, contact fields under contactChannels)
  await payload.updateGlobal({
    slug: 'support',
    data: {
      pageHeader: {
        pageTitle: 'Before you ask',
        pageSubtitle: "Most answers are here. If not, I'm one message away.",
      },
      contactChannels: {
        contactEmail: 'marcus@offbrand.design',
        githubIssuesUrl: 'https://github.com/mbenhard/untask/issues',
        xDmUrl: 'https://x.com/halfgypsyprince',
      },
      faqItems: [
        {
          anchorId: 'gatekeeper',
          question: "App won't open after download?",
          answer: 'macOS blocks apps downloaded outside the App Store. Open Terminal and run:',
          code: 'xattr -cr /Applications/Untask.app',
          note: 'Then open the app again. This only needs to be done once. Installing via Homebrew avoids this entirely.',
        },
        {
          question: 'AI not responding?',
          answer: "Check Settings > Assistant \u2014 make sure a valid API key is saved for your selected provider. For Ollama, ensure it's running locally.",
        },
        {
          question: 'Rate limit errors?',
          answer: 'Some models have usage limits. Wait and click "Retry". Try switching to a different model in Settings > Assistant.',
        },
        {
          question: "Where's my data?",
          answer: 'Everything is local: ~/Library/Application Support/Untask/. Database, attachments, and backups all stay on your machine.',
        },
        {
          question: 'Backup & restore',
          answer: 'Settings > Backup > "Create backup" or "Export". To restore: click any backup, or Import a .taskdb file.',
        },
        {
          question: 'Global shortcut not working?',
          answer: 'Another app may be using the same key combo. Go to Settings > Shortcuts and record a different combination.',
        },
        {
          question: 'Bugs & feature requests',
          answerHtml: 'Open an issue on <a href="https://github.com/mbenhard/untask/issues" target="_blank" rel="noopener" class="underline underline-offset-2 decoration-muted-foreground/45 hover:decoration-muted-foreground transition-colors">GitHub</a>. No promises, but I read everything.',
        },
        {
          question: 'Is my data private?',
          answer: '100%. Nothing leaves your machine. No telemetry, no cloud.',
        },
      ],
      _status: 'published',
    },
  })
  console.log('Seeded: Support')

  // Seed Footer (signoff fields now nested under signoff group)
  await payload.updateGlobal({
    slug: 'footer',
    data: {
      navLinks: [
        { label: 'Home', href: '/' },
        { label: 'Download', href: '/#download' },
        { label: 'Changelog', href: '/changelog' },
        { label: 'Support', href: '/support' },
        { label: 'Privacy', href: '/privacy' },
      ],
      signoff: {
        signoffText: 'Love from',
        signoffName: 'Marcus',
        signoffLink: '/support',
      },
    },
  })
  console.log('Seeded: Footer')

  console.log('\nSeeding complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
