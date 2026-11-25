# Contributing

Thanks for helping. Setup is in the [README](README.md#develop).

- Open an issue before big changes so we can agree on the shape first.
- Keep pull requests small and focused. Include a test for any logic change (`npm test`).
- Run `npx tsc --noEmit` and `npm run lint` before pushing.
- New trackers and packs live in `src/lib/templates.ts`; they are the easiest first contribution.
- Never commit real personal or health data, in code, tests or screenshots. Use synthetic data.

By contributing you agree your work is released under the [AGPL-3.0](LICENSE).

## Licensing of contributions

Sending a pull request means you agree to all of the following:

- The work is yours to submit, and it does not contain code you cannot license.
- You grant Gustavo Marcelino a perpetual, worldwide, non-exclusive, royalty-free, irrevocable
  licence to use, reproduce, modify, distribute and sublicense your contribution, including under a
  different licence.
- Everyone else receives your contribution under the licence in `LICENSE`.

Sign every commit with `git commit -s` so it carries `Signed-off-by: Name <email>`. A pull request
without a sign-off gets asked to add one.
