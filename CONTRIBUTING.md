# Contributing

1. Run `pnpm quickstart` to get a working database, then `pnpm acceptance` to confirm it is green before you change anything.
2. Any change to authorization, revisions or change sets needs a test in `packages/acceptance/src/suite.test.ts`. Write it so it fails first.
3. Keep `pnpm build`, `pnpm typecheck` and `pnpm acceptance` passing.
4. One logical change per pull request, with a description of what you verified.
5. Found an authorization hole? Open an issue and say so in the title rather than quietly patching it.
