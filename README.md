<div align="center">
  <a href="https://monetizationos.com">
  <img alt="MonetizationOS logo" src="https://app.monetizationos.com/static/monetizationos-logo.png" height="48">
  </a>
  <h1>MonetizationOS Akamai Proxy</h1>
</div>

[MonetizationOS](https://monetizationos.com) powers monetization for human and bot users alike. Use this Akamai EdgeWorkers service to proxy your website and integrate MonetizationOS Surfaces, enabling seamless monetization experiences for sites served with static HTML.

This worker includes handling for both HTTP response modification and CSS-targeted Components for content modifications including: removal/truncation, displaying offerings, and custom messaging.

The shared proxy pipeline is provided by [`@monetizationos/proxy`](https://www.npmjs.com/package/@monetizationos/proxy). This repository contains the EdgeWorkers entrypoint (`responseProvider`), Property Manager variable mapping, and Akamai-specific adapters for `HtmlRewritingStream`, `httpRequest()`, and routing MonetizationOS API traffic through your property via `/mos-api`.

Read more about using MonetizationOS at [docs.monetizationos.com](https://docs.monetizationos.com).

This package mirrors the architecture of the [Cloudflare proxy worker](https://github.com/MonetizationOS/cloudflare-proxy-worker).

## Required variables

Set these in your Akamai property using the **Set Variable** behavior with the `PMUSER_` prefix. See `.env.example` for reference values.

| PMUSER variable | Maps to | Description |
|---|---|---|
| `PMUSER_MOS_SECRET_KEY` | `MONETIZATION_OS_SECRET_KEY` | Your MonetizationOS secret key. [Get your secret key](https://docs.monetizationos.com/docs/guides/environments/managing-environments#api-keys). |
| `PMUSER_ORIGIN_URL` | `ORIGIN_URL` | The full URL of the origin server for your proxied website. |
| `PMUSER_SURFACE_SLUG` | `SURFACE_SLUG` | The slug for the MonetizationOS surface you want to target. |
| `PMUSER_AUTH_JWT_COOKIE` | `AUTHENTICATED_USER_JWT_COOKIE_NAME` | Cookie name for authenticated user JWT sessions. |
| `PMUSER_ANON_COOKIE` | `ANONYMOUS_SESSION_COOKIE_NAME` | Cookie name for anonymous sessions. |
| `PMUSER_INJECT_SCRIPT_URL` | `INJECT_SCRIPT_URL` | URL of the MonetizationOS web components script to inject when component transforms run. |
| `PMUSER_MOS_HOST` | `MONETIZATION_OS_HOST` | MonetizationOS API host. Defaults to `https://api.monetizationos.com` in the worker config. |
| `PMUSER_MOS_ENDPOINTS_PREFIX` | `MONETIZATION_OS_ENDPOINTS_PREFIX` | Path prefix for proxied custom endpoints. Defaults to `/mos-endpoints/` in the worker config. |
| `PMUSER_MOS_API_PREFIX` | — | Path prefix for the Property Manager rule that forwards API sub-requests to `api.monetizationos.com`. Defaults to `/mos-api`. |

`httpRequest()` only reaches hostnames served through your Akamai property. API sub-requests use relative URLs such as `{PMUSER_MOS_API_PREFIX}/api/v1/...` (default `/mos-api/api/v1/...`), which your property must map to `api.monetizationos.com` (see [Property Manager configuration](#property-manager-configuration) below).

## Optional: paths that skip surface decisions

`PMUSER_SURFACE_DECISIONS_IGNORE_PATHS` is a comma-separated list of regular expressions. Matching pathnames still proxy to the origin and rewrite origin links, but skip MonetizationOS surface decisions and component transforms.

## Optional: headers sent to the origin

`PMUSER_ORIGIN_REQUEST_HEADERS` adds or overrides outgoing headers on every upstream `httpRequest()` to the origin. Set it to a JSON object mapping header names to values. Leave it empty or omit it when no extra headers are needed.

Example Property Manager value:

```json
{"X-Api-Key": "secret", "X-Custom": "my-value"}
```

## Runtime note: Web Platform polyfills

This project uses Akamai's official TypeScript bindings (`@types/akamai-edgeworkers`) for EdgeWorkers request objects and built-in modules (`http-request`, `streams`, `html-rewriter`, `create-response`). Those bindings are compile-time only; they do not add runtime globals.

Akamai EdgeWorkers do not provide the standard Web Platform globals that `@monetizationos/proxy` expects (`URL`, `Headers`, `Request`, `Response`, `ReadableStream`, `WritableStream`, `TransformStream`, `TextEncoder`, `TextDecoder`). The worker installs minimal polyfills at startup via `src/installAkamaiGlobals.ts` before the shared core runs. Avoid top-level use of those globals in worker code — Akamai static validation evaluates the bundle at upload time.

If the response body shows `ReferenceError: … is not defined`, rebuild and redeploy — that means the active EdgeWorker version predates the polyfill for that global.

## HTML rewriting notes

Akamai provides [`HtmlRewritingStream`](https://techdocs.akamai.com/edgeworkers/docs/htmlrewriter) (lol-html, same family as Cloudflare `HTMLRewriter` and Fastly `HTMLRewritingStream`). The shared core applies these constraints on Akamai:

- `:last-child` selectors are logged and skipped
- `replaceRange` requires `onEndTag`; Akamai's rewriter does not expose it, so range replacement is skipped (same as Fastly)
- Inserted text nodes are escaped in the adapter when the core requests non-HTML content

## Commands

- `pnpm run build` — Typecheck and bundle to `dist/main.js`.
- `pnpm run bundle` — Build and create `monetizationos-akamai-proxy.tgz` for upload.
- `pnpm test` — Run tests with Vitest.
- `pnpm run test:run` — Run tests once (CI).
- `pnpm run deploy` — Build the bundle and print upload instructions.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Akamai CLI](https://github.com/akamai/cli) with EdgeWorkers and Sandbox modules

### Install the Akamai CLI

**macOS (Homebrew):**

```bash
brew install akamai
akamai install edgeworkers
akamai install sandbox
```

**Linux / manual install:** download from the [GitHub releases page](https://github.com/akamai/cli/releases), add to `$PATH`, then run the `akamai install` commands above.

### API credentials

Create `~/.edgerc` from [Akamai Control Center](https://control.akamai.com/) → **Identity and Access Management** → **Create API client** (Quick). The client needs **EdgeWorkers** and **Sandbox** API access.

### Troubleshooting: `Cannot find module 'akamai-edgegrid'`

If `akamai edgeworkers` fails with that error, the EdgeWorkers CLI package was installed without its Node dependencies (common after `akamai install edgeworkers` or Node upgrades). Reinstall them:

```bash
cd ~/.akamai-cli/src/cli-edgeworkers/
npm install
npm run build
```

Then retry your command. You can also refresh the package with `akamai update edgeworkers` and run the same steps if the error persists.

---

## Local development

1. Install dependencies:

    ```sh
    pnpm install
    ```

2. Run tests:

    ```sh
    pnpm run test:run
    ```

3. Build the EdgeWorkers bundle:

    ```sh
    pnpm run bundle
    ```

This produces `monetizationos-akamai-proxy.tgz` containing `bundle.json` and `main.js`.

---

## Property Manager configuration

Complete these steps in [Akamai Control Center](https://control.akamai.com/) Property Manager.

### Origins

Configure origins so `httpRequest()` can reach:

- **Your website origin** (hostname from `PMUSER_ORIGIN_URL`)
- **MonetizationOS API** — `api.monetizationos.com` (used by the `/mos-api` rule below)

### Default rule

**EdgeWorkers**

- Enable: **On**
- Identifier: your EdgeWorker ID (upload the bundle first)

**Error handling**

- Continue on error: **On** (requests may reach the origin unprocessed if the worker fails)

**Origin server**

- Origin type: **Your Origin**
- Origin server hostname: your website origin
- Forward Host Header: **Origin Hostname**
- Cache Key Hostname: **Incoming Host Header**

### MonetizationOS API proxy rule

Add a rule (e.g. **MonetizationOS API Proxy**) matching path `/mos-api/*`:

**Modify Outgoing Request Path**

- Find: `/mos-api/`
- Replace with: `/`
- First occurrence only; keep query parameters

**Origin server**

- Origin server hostname: `api.monetizationos.com`
- Forward Host Header: **Origin Hostname**

This strips `/mos-api/` and forwards to the MonetizationOS API origin for worker sub-requests and does not re-enter the EdgeWorker.

---

## Local testing with Akamai Sandbox

The [Akamai Sandbox](https://techdocs.akamai.com/sandbox/docs/test-edgeworkers-functions-sandbox) runs the production EdgeWorkers runtime (`httpRequest`, `createResponse`, etc.) against your property configuration.

One-time setup:

```bash
pnpm run bundle
akamai edgeworkers upload --bundle ./monetizationos-akamai-proxy.tgz <edgeworker-id>
akamai sandbox create --hostname <your-hostname> --name mos-sandbox
akamai sandbox start
```

Test (sandbox listens on `http://127.0.0.1:9550`):

```bash
curl --header 'Host: <your-hostname>' http://127.0.0.1:9550/
```

Update code without restarting the sandbox:

```bash
pnpm run bundle && akamai sandbox update-edgeworker <edgeworker-id> ./monetizationos-akamai-proxy.tgz
```

**Debugging**

```bash
# responseProvider debug (appended to body)
curl --header 'Host: <your-hostname>' --header 'Pragma: akamai-x-ew-debug-rp' http://127.0.0.1:9550/

# logger.log() output (response headers)
curl -sD - --header 'Host: <your-hostname>' --header 'Pragma: akamai-x-ew-debug' http://127.0.0.1:9550/

# httpRequest sub-requests
curl -sD - --header 'Host: <your-hostname>' --header 'Pragma: akamai-x-ew-debug-subs' http://127.0.0.1:9550/
```

---

## Deploy to production

```bash
pnpm run bundle
akamai edgeworkers upload --bundle monetizationos-akamai-proxy.tgz <edgeworker-id>
akamai edgeworkers activate <edgeworker-id> STAGING <version>
akamai edgeworkers activate <edgeworker-id> PRODUCTION <version>
```

Ensure the property **EdgeWorkers** behavior is enabled with `responseProvider` selected.

---

## Platform comparison

| Feature | Cloudflare | Fastly | Akamai |
|---|---|---|---|
| Entry point | `export default { fetch() }` | `addEventListener("fetch", ...)` | `export async function responseProvider()` |
| Configuration | `wrangler` bindings / vars | Config Store + Secret Store | Property Manager `PMUSER_*` variables |
| HTML rewriting | `HTMLRewriter` | `HTMLRewritingStream` | `HtmlRewritingStream` |
| Outbound requests | `fetch()` | `fetch()` with `{ backend }` | `httpRequest()` |
| MOS API reachability | Direct to `MONETIZATION_OS_HOST` | Backend `monetization_api` | Property path prefix `/mos-api` |
