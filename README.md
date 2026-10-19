# Brahagebra

A mobile graphing calculator with calculated solution steps and an optional AI tutor.

## Run locally

Requires Node.js 22.10 or later.

```sh
npm install
npm run server
```

In a second terminal, run `npm run dev`. Open the address printed by Vite. The app and solver work without an API key. The dev server proxies `/api` to the local server on port 3001.

## Connect the AI tutor

Copy `.env.example` to `.env`. Set `OPENAI_API_KEY` and `OPENAI_MODEL` to a model available to your OpenAI API project, then restart the server. Never place a key in browser code or a `VITE_` environment variable. The tutor sends the student's question and displayed computation to OpenAI only after they press Ask. It requests `store: false` and does not store chat history locally.

API integration follows the [official Responses API quickstart](https://developers.openai.com/api/docs/quickstart). AI text is separate from the calculated result and can be wrong. No paid API requests are part of the automated checks.

## Build and serve

```sh
npm run build
npm run server
```

The Node server serves `dist` and the tutor API at http://127.0.0.1:3001. It binds to localhost by default. For public hosting, put it behind HTTPS, configure `APP_ORIGIN`, and add authenticated access and a shared request budget at your hosting layer. The included per-address limiter is intended for a single server process, not a distributed deployment. Never expose the Vite development server publicly.

## Solver scope

- Graphs are explicit functions of x. General implicit geometry, sliders and symbolic CAS are not implemented.
- Roots and intersections are numerical findings in the current horizontal viewport. The absence of a detected root is not proof of no real solutions.
- Linear and quadratic polynomial inequalities use all their algebraically computed boundaries, including isolated solutions. Other inequalities are explicitly labeled numerical estimates within the scanned range; no inference to infinity is made.
- Numerical scanning may miss narrow or high frequency features. Floating point overflow, ill conditioning, and discontinuities limit reliability. A graph is an aid to understanding, not a proof.
- Work is saved to this browser's local storage. Undo/redo stores up to 80 edits during the current session. Private browsing or cleared storage can remove saved work.

## Checks

```sh
npm run build
npm test
npm run test:server
npm audit
```

The server tests mock the AI provider and verify missing configuration, input limits, origin protection, rate limiting, and error handling.
