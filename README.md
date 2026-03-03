# MonetizationOS Akamai Proxy

An Akamai EdgeWorkers service that proxies requests to an origin server and applies MonetizationOS surface decisions, behaviors, and component transformations.

This is the Akamai EdgeWorkers equivalent of the Cloudflare Worker and Fastly Compute worker.

## Architecture

The worker processes requests through a pipeline:

1. **Origin Request** — Proxies the request to the configured origin server (or handles MonetizationOS custom endpoint requests)
2. **Rewrite Origin Response** — Rewrites origin URLs in headers and body to match the proxy's URL
3. **Surface Decisions** — Fetches surface decisions from the MonetizationOS API
4. **Surface Behavior** — Applies HTTP-level behaviors (headers, cookies, redirects)
5. **Surface Components** — Applies HTML-level component transformations using string-based regex matching

## Key Differences from Cloudflare/Fastly Versions

| Feature | Cloudflare | Fastly | Akamai |
|---|---|---|---|
| Entry point | `export default { fetch() }` | `addEventListener("fetch", ...)` | `export async function responseProvider()` |
| Environment | `Env` bindings | `ConfigStore` + `SecretStore` | Property Manager variables (`PMUSER_`) |
| HTML rewriting | `HTMLRewriter` (streaming) | `HTMLRewritingStream` (streaming) | `HtmlRewritingStream` (streaming) |
| Outbound fetch | Direct `fetch()` | `fetch()` with `{ backend }` | `httpRequest()` from `http-request` |
| Language | TypeScript | JavaScript | JavaScript |

### HTML Rewriting Strategy

Akamai EdgeWorkers provide `HtmlRewritingStream` via the built-in [`html-rewriter`](https://techdocs.akamai.com/edgeworkers/docs/htmlrewriter) module — the same lol-html streaming engine used by Cloudflare's `HTMLRewriter` and Fastly's `HTMLRewritingStream`. The API surface (`onElement`, `before`, `after`, `prepend`, `append`, `remove`, `replaceWith`) is nearly identical across all three platforms.

Limitations:
- `:last-child` selectors are logged and skipped
- Range replacements are not supported (same as Fastly)
- `HtmlRewritingStream` does not auto-escape inserted content, so text elements are pre-escaped before insertion

## Prerequisites

- [Node.js](https://nodejs.org/)

## Setup

### 1. Install the Akamai CLI

**macOS (Homebrew):**

```bash
brew install akamai
```

**Linux / manual install:**

Download the binary for your platform from the [GitHub releases page](https://github.com/akamai/cli/releases), make it executable, and add it to your `$PATH`:

```bash
curl -L https://github.com/akamai/cli/releases/latest/download/akamai-<version>-linux-amd64 -o /usr/local/bin/akamai
chmod +x /usr/local/bin/akamai
```

Then install the EdgeWorkers and Sandbox CLI modules:

```bash
akamai install edgeworkers
akamai install sandbox
```

### 2. Configure API Credentials

The Akamai CLI authenticates via an `.edgerc` file in your home directory. To create one:

1. Log into [Akamai Control Center](https://control.akamai.com/)
2. Go to **Identity and Access Management** → **Create API client**
3. Select **Quick** and **Download** your credentials
4. Save the file as `~/.edgerc` and make sure it has a `[default]` section header:

```ini
[default]
client_secret = xxxx
host = xxxx.luna.akamaiapis.net
access_token = xxxx
client_token = xxxx
```

The API client needs access to **EdgeWorkers** and **Sandbox** APIs.

### 3. Install Node.js dependencies

```bash
npm install
```

### 4. Configure Property Manager Variables

In your Akamai property configuration, create the following user-defined variables using the **Set Variable** behavior. See `.env.example` for reference values.

| Variable | Description | Example |
|---|---|---|
| `PMUSER_ORIGIN_URL` | The full URL of the origin server | `https://news.wingorigin.dev` |
| `PMUSER_SURFACE_SLUG` | MonetizationOS surface slug identifier | `future-herald-web` |
| `PMUSER_AUTH_JWT_COOKIE` | Cookie name for authenticated user JWT | `__session` |
| `PMUSER_ANON_COOKIE` | Cookie name for anonymous sessions | `anon-session-id` |
| `PMUSER_INJECT_SCRIPT_URL` | URL of the web components script to inject | `https://assets.monetizationos.com/web-components-latest.js` |
| `PMUSER_MOS_HOST` | MonetizationOS API host URL | `https://api.monetizationos.com` |
| `PMUSER_MOS_ENDPOINTS_PREFIX` | URL prefix for proxied API endpoints | `/mos-endpoints/` |
| `PMUSER_MOS_API_PREFIX` | Path prefix for the MonetizationOS API proxy rule | `/mos-api` |
| `PMUSER_MOS_SECRET_KEY` | MonetizationOS API secret key | `sk_preview_...` |

### 5. Configure Origins

Add the following origins to your Akamai property so `httpRequest()` can reach them:

- **Origin server** — your website origin (e.g., `news.wingorigin.dev`)
- **MonetizationOS API** — `api.monetizationos.com`

### 6. Akamai Property Manager Configuration

The following steps must be completed in the [Akamai Control Center](https://control.akamai.com/) Property Manager UI.

#### 6.1 Create a Property

Create a new property under **Property Manager** → **Properties** → **Create Property**. Assign the hostname that will serve proxied traffic (e.g., `akamai.wingdemo.dev`).

#### 6.2 Configure the Default Rule

In the property's **Default Rule**, add the following behaviors:

**EdgeWorkers**
- Enable: **On**
- Identifier: select the EdgeWorker ID created for this proxy (e.g., `105618 (Tier 100) mos-edgeworker`)

**Error Handling**
- Continue on error: **On** — ensures requests still reach the origin if the EdgeWorker fails (note: this can lead to unprocessed responses being served)

**Origin Server**
- Origin Type: **Your Origin**
- Origin Server Hostname: your website origin (e.g., `news.wingorigin.dev`)
- Forward Host Header: **Origin Hostname**
- Cache Key Hostname: **Incoming Host Header**
- Send True Client IP Header: **Yes**
- True Client IP Header Name: `True-Client-IP`

#### 6.3 Create the MonetizationOS API Proxy Rule

Add a new rule (e.g., named **MonetizationOS API Proxy**) with the following configuration:

**Criteria**
- Match: **Path** matches one of `/mos-api/*`

**Behaviors**

*Modify Outgoing Request Path*
- Action: **Replace part of the incoming path**
- Find: `/mos-api/`
- Replace with: `/`
- Occurrences: **First occurrence only**
- Keep the query parameters: **Yes**

*Origin Server*
- Origin Type: **Your Origin**
- Origin Server Hostname: `api.monetizationos.com`
- Forward Host Header: **Origin Hostname**
- Cache Key Hostname: **Origin Hostname**
- Send True Client IP Header: **Yes**
- True Client IP Header Name: `True-Client-IP`

This rule strips the `/mos-api/` prefix and forwards the request directly to the MonetizationOS API, bypassing the EdgeWorker for API-to-API traffic.

### 7. Build

```bash
npm run bundle
```

This produces `monetizationos-akamai-proxy.tgz` containing `bundle.json` and `main.js`.

## Local Testing with Akamai Sandbox

The [Akamai Sandbox](https://techdocs.akamai.com/sandbox/docs/test-edgeworkers-functions-sandbox) runs the real EdgeWorkers runtime locally — same `httpRequest`, `createResponse`, and `logger` modules as production. Your Property Manager variables and origin configuration are pulled from your actual Akamai property, so the behavior is identical to production.

### One-time setup

Upload the bundle and create a sandbox:

```bash
npm run bundle
akamai edgeworkers upload --bundle ./monetizationos-akamai-proxy.tgz <edgeworker-id>
akamai sandbox create --hostname <your-hostname> --name mos-sandbox
akamai sandbox start
```

### Testing

The sandbox listens on `http://127.0.0.1:9550`. Test with curl:

```bash
curl --header 'Host: <your-hostname>' http://127.0.0.1:9550/
```

Or point your browser by adding an entry to `/etc/hosts`:

```
127.0.0.1  <your-hostname>
```

Then visit `http://<your-hostname>:9550/`.

### Updating code

After making changes, rebuild and push to the sandbox without restarting it:

```bash
npm run bundle && akamai sandbox update-edgeworker <edgeworker-id> ./monetizationos-akamai-proxy.tgz
```

### Debugging

**View `responseProvider` debug info** (appended to the response body):

```bash
curl --header 'Host: <your-hostname>' \
     --header 'Pragma: akamai-x-ew-debug-rp' \
     http://127.0.0.1:9550/
```

**View `logger.log()` output** (in response headers, capped at 1024 bytes per handler):

```bash
curl -sD - --header 'Host: <your-hostname>' \
           --header 'Pragma: akamai-x-ew-debug' \
           http://127.0.0.1:9550/
```

**Debug sub-requests** (`httpRequest` calls to origin and MonetizationOS API):

```bash
curl -sD - --header 'Host: <your-hostname>' \
           --header 'Pragma: akamai-x-ew-debug-subs' \
           http://127.0.0.1:9550/
```

## Deploy to Production

### 1. Upload

```bash
akamai edgeworkers upload monetizationos-akamai-proxy.tgz <edgeworker-id>
```

### 2. Activate on staging

```bash
akamai edgeworkers activate <edgeworker-id> STAGING <version>
```

### 3. Activate on production

```bash
akamai edgeworkers activate <edgeworker-id> PRODUCTION <version>
```

Make sure the property has the **EdgeWorkers** behavior enabled with `responseProvider` selected.
