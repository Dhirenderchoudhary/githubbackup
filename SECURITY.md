# Security

gitbackup handles GitHub tokens and storage keys, so security reports matter.

## Reporting

Please do not open a public issue. Use [private vulnerability reporting](https://github.com/Dhirenderchoudhary/gitbackup/security/advisories/new) on GitHub. You will get a reply within a week.

## How gitbackup handles secrets

- Tokens and keys are read on your computer only. The deployed landing page never receives them, and its API routes refuse requests that are not from this computer.
- A token saved in the app goes to `~/.config/gitbackup/settings.json` with permissions `600`.
- The local app listens on 127.0.0.1, and it rejects changes sent from other websites.
- CLI error messages have known secrets replaced with `[redacted]`.
