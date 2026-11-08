# gitbackup

Back up the GitHub repositories you created, with every branch, tag, and note, to Amazon S3, Cloudflare R2, or Google Drive. Restore them as plain git repositories you can clone.

Needs git and Node.js 22.18 or newer.

```sh
npx gitbackup check                 # which destination the next run uses
npx gitbackup backup                # back up repositories you own
npx gitbackup restore --to s3 --out ./restored
npx gitbackup --help
```

Settings come from environment variables or a `.env` file in the current folder: `GITHUB_TOKEN`, `GITBACKUP_TO` (`s3`, `r2`, or `drive`), and that destination's keys. The full list, the local app, and the safety rails are in the [project README](https://github.com/Dhirenderchoudhary/githubbackup#readme).

Site: https://githubbackup.dhirenderchoudhary.com

MIT licensed.
