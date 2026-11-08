# Contributing

Thanks for helping. Bug reports, fixes, and new destinations are all welcome.

## Set up

```sh
git clone https://github.com/Dhirenderchoudhary/githubbackup.git
cd githubbackup
npm install
npm test
```

You need git and Node.js 22.18 or newer. `npm run dev` starts the app at http://127.0.0.1:3000.

## Where things live

- `packages/cli/src` is the backup engine and the `gitbackup` command. `backup.ts` runs a backup, `bucket.ts` and `drive.ts` publish to each destination, `github.ts` talks to the GitHub API.
- `app/`, `components/`, and `lib/` are the local app. `lib/jobs.ts` starts the CLI for a run and records its progress. `lib/schedule.ts` runs scheduled backups.
- `components/ui` holds [shadcn/ui](https://ui.shadcn.com) components. Add more with `npx shadcn@latest add <name>`.

## Before you open a pull request

- `npm test`, `npm run typecheck`, and `npm run build` pass.
- New behavior has a test that calls the code the way a user would and checks the result.
- UI changes work in light and dark mode and at phone width.
- Never log or print a token. Errors from the CLI pass through `redact` for that reason.

Keep pull requests focused on one change, and describe what a user notices.
