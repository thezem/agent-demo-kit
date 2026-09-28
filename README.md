# agent-demo-kit

Watchable, URL-triggered demos for React apps. A demo runs in the user's browser against the rendered UI and can report its result to a local CLI listener. It is intended for development and review, not production traffic.

This is a **public source preview**. The package has not been published to the npm registry. The [standalone HTML landing page](landing/index.html) and permanent **Notion-like dim elegant** visual system in [DESIGN.md](DESIGN.md) are included in this repository.

## Quick start

Clone the repository and build the package:

```sh
git clone https://github.com/thezem/agent-demo-kit.git
cd agent-demo-kit
npm install
```

In a React project on the same machine, install the local package with `npm install /path/to/agent-demo-kit`. Public npm installation will be documented when the package is published.

Create `src/demos/project-search.ts`:

```ts
import { demo } from "agent-demo-kit";

export default demo("project-search", async ({ page, show }) => {
  await show("Find a project");
  await page.goto("/projects");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder("Search projects").fill("Apollo");
  await page.getByRole("link", { name: "Apollo redesign" }).click();
  await page.getByRole("heading", { name: "Apollo redesign" }).expectVisible();
});
```

Mount the runner once near the app root:

```tsx
import { DemoRunner } from "agent-demo-kit/react";
import projectSearch from "./demos/project-search";

<>
  <App />
  <DemoRunner demos={[projectSearch]} enabled={import.meta.env.DEV} />
</>
```

Start your dev server normally, then open `http://localhost:5173/?demo=project-search`. The browser runs the demo and displays progress. The card has a **Delay before each action** slider from Instant to 5 seconds. You can change it while the demo runs; the next action uses the new value. The setting is saved in local storage and survives page navigation. The `paceMs` prop sets the initial delay if the viewer has not chosen one. `enabled` defaults to `false`; deliberately enable it only in development. For non-Vite builds, use that bundler's development flag.

For a machine-readable result, run the CLI from the React project after starting its dev server:

```sh
npx agent-demo run --demo project-search --url http://localhost:5173/ --json demo-result.json
```

`run` starts a local listener and opens the exact demo URL in the machine's default user-facing browser. The CLI prints each step, writes JSON if requested, and exits `0` for pass or `1` for fail/timeout. The agent can read this result without controlling or inspecting the browser. If the machine has no desktop browser opener, the CLI prints the URL so a person can open it. Use `listen` when you want to open the printed URL yourself or choose a different browser. The listener binds to `127.0.0.1` and accepts one result with a per-run token. The browser sends the result only when `demoRun` is present.

## Instructions for AI agents

For a React feature that can be exercised through this API, use a demo as the **development review and E2E check** instead of starting an agent-controlled Playwright session for every change:

1. Add one small demo file beside the feature. Write real DOM actions and at least one assertion for the outcome the user needs to verify. Prefer accessible roles and names. Keep the sequence safe to repeat against development data.
2. Register it in `<DemoRunner demos={[...]} enabled={import.meta.env.DEV} />` near the app root. Start the project's normal dev server and leave it running.
3. Run `npx agent-demo run --demo YOUR_ID --url http://localhost:YOUR_PORT/ --json demo-result.json`. The CLI opens the URL in the user's default browser. To use a specific browser, run `listen` instead and open its printed URL there. **Do not inspect or drive the browser after opening the URL** for this check; wait for the CLI result.
4. Treat exit code `0` plus the recorded assertions as the evidence. On failure, fix the application or the demo's locator and rerun. Give the human the same demo URL for watchable review, and report which assertions passed rather than saying only that the page loaded.

The browser and CLI listener must run on the same machine for the default `127.0.0.1` result channel. A remote browser needs an appropriate local forwarding setup. This flow covers the DOM actions in the API below; keep Playwright or another browser tool for cross-browser testing, screenshots, network inspection, complex input, and unsupported flows.

## API

- `demo(id, async ({ page, show }) => { ... })` defines a demo.
- `page.goto(path)` navigates within the current origin and preserves the demo query parameters. The runner resumes after a full reload.
- `page.getByRole(role, { name })`, `getByPlaceholder(text)`, `getByText(text)`, and `locator(css)` find visible elements. Multiple matches fail so a misleading element is not chosen silently.
- Locators support `click()`, `fill(value)`, `expectVisible()`, and `expectText(text)`.
- `show(message)` displays a narration step.
- At least one assertion is required for a pass.
- The runner emits a `agent-demo:result` document event with a `DemoResult` in `event.detail` after each step and at completion.

## Scope and limitations

The checks run in the actual page, but this is a deliberately small browser API, not a replacement for Playwright. `fill()` supports native inputs and textareas. Accessible-name matching supports common elements, `aria-label`, `aria-labelledby`, and input labels; it does not implement the full accessibility-name specification. Links on the same origin perform a full navigation so the runner can resume reliably. Demo steps should avoid irreversible actions and use development data. A passing demo verifies only its scripted assertions.

The CLI result channel is designed for a local HTTP dev server. If the app is served over HTTPS, browser mixed-content restrictions may block reporting to the local HTTP listener; the on-page result still works.

## Development

```sh
npm install
npm run build
npm run dev
npm run e2e
npm run site
```

The larger example is at `http://localhost:5173/?demo=launch-review`. It is a fictional launch workspace with project search, a task board, filtering, task creation, status change, notes, and activity review. It runs 35 narrated and checked steps. The previous `?demo=project-search` URL remains an alias for the expanded walkthrough. The landing page runs separately at `http://localhost:4174/` with `npm run site`.

Landing fonts are bundled for consistent offline rendering. Their upstream notices are in `landing/assets/licenses/`.
