# UI Validation Notes

This folder reserves lightweight validation coverage for `@huoziwriter/ui`.

Current scaffolding:
- `pnpm --filter @huoziwriter/ui test-storybook` smoke-checks Storybook startup.
- `pnpm --filter @huoziwriter/ui build-storybook` produces the static catalog used for UI review.
- `pnpm --filter @huoziwriter/ui test-storybook:a11y` runs axe assertions against every built story via Playwright + Chrome.
- Storybook coverage now includes the core primitives: `Button`, `Card`, `Input`, `Textarea`, and `Select`, in addition to the token baseline story.

Follow-up work:
- Add visual regression coverage after the vNext token and component migration stabilizes.
