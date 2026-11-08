export const beats = [
  {
    id: 'setup',
    n: '1',
    label: 'Setup',
    href: '/setup',
    title: 'Add a GitHub token',
    body: 'Paste a GitHub token. It is stored on this computer. Leave the box empty and gitbackup reads GITHUB_TOKEN from .env.',
  },
  {
    id: 'repos',
    n: '2',
    label: 'Repositories',
    href: '/repos',
    title: 'Choose what to save',
    body: 'Repositories you created that are not forks start selected. Tick organization, starred, forked, or collaborator to add those groups. Branches, tags, and notes come with each repository.',
  },
  {
    id: 'backup',
    n: '3',
    label: 'Backup',
    href: '/backup',
    title: 'Watch each repository',
    body: 'One run writes to the destination named in .env. Each repository shows waiting, cloning, saved, or failed. The log is that same run.',
  },
  {
    id: 'schedule',
    n: '4',
    label: 'Schedule',
    href: '/schedule',
    title: 'Run it again later',
    body: 'Pick daily, weekly, or monthly. The header shows the next run while this app is open. On a Mac, a menu-bar icon shows it too. Closing the terminal pauses the schedule.',
  },
] as const

export type BeatId = typeof beats[number]['id']

export const groups = [
  { id: 'owned', label: 'Owned', help: 'Repositories you created. Forks are not in this group.' },
  { id: 'organization', label: 'Organization', help: 'Repositories in an organization you belong to.' },
  { id: 'starred', label: 'Starred', help: 'Repositories you starred.' },
  { id: 'forked', label: 'Forked', help: 'Forks you created.' },
  { id: 'collaborator', label: 'Collaborator', help: 'Repositories you can push to that someone else owns.' },
] as const

export type GroupId = typeof groups[number]['id']

export const sourceLabel: Record<string, string> = {
  owned: 'Owned',
  org: 'Organization',
  starred: 'Starred',
  forked: 'Forked',
  collaborator: 'Collaborator',
}

export const stageLabel = {
  pending: 'Waiting',
  cloning: 'Cloning',
  done: 'Saved',
  failed: 'Failed',
} as const

export const runSteps = [
  {
    n: '1',
    title: 'Clone this repository',
    body: 'You need git and Node.js 22.18 or newer. Check with git --version and node --version.',
    command: cloneCommand(process.env.GITBACKUP_REPO_URL ?? ''),
    link: '',
  },
  {
    n: '2',
    title: 'Say where the backup goes',
    body: 'Copy the example file, open .env, and set GITBACKUP_TO to s3, r2, or drive. Fill in the block for that one destination. The GitHub token can wait for the next step.',
    command: 'cp .env.example .env',
    link: '',
  },
  {
    n: '3',
    title: 'Start the app',
    body: 'Leave this terminal open. Scheduled backups run while it is open.',
    command: 'npm install\nnpm run dev',
    link: '',
  },
  {
    n: '4',
    title: 'Open it and follow the four steps',
    body: 'Paste a GitHub token, tick the repositories, press Start backup, then pick a schedule. The page shows each repository as it is saved.',
    command: '',
    link: 'http://127.0.0.1:3000',
  },
]

function cloneCommand(url: string): string {
  if (!url) return ''
  const folder = url.replace(/\.git$/, '').split('/').pop()
  return `git clone ${url}\ncd ${folder}`
}
