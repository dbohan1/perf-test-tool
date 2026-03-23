# perf-test

An automated performance benchmarking CLI that runs **four tools in parallel** against any URL and produces a console summary, a JSON results file, and a self-contained HTML report.

---

## Tools

| Tool | Type | What it measures |
|---|---|---|
| **Newman (Postman)** | API | Response time — min, avg, max, P95, success rate |
| **Apache JMeter** | API | Response time under concurrent virtual user load |
| **Chrome DevTools (Puppeteer)** | Page | TTFB, DOM load, full load via Navigation Timing API |
| **Lighthouse** | Page | LCP, FCP, TTI, TBT, CLS, performance score |

---

## Prerequisites

- **Node.js** 18+
- **Java** (required for JMeter) — the tool will auto-download JMeter once Java is available

> If Java is not installed, JMeter is skipped gracefully and all other tools still run.

---

## Installation

```bash
cd PerfTesting
npm install
```

`npm install` will also download Puppeteer's bundled Chromium (~170MB) on first run.

---

## Usage

### Interactive wizard (recommended)

Run with no arguments to be guided through all options step by step:

```bash
node bin/perf-test.js
```

The wizard prompts for:
1. Target URL
2. Iterations and concurrency
3. Output directory
4. Whether the page needs authentication — and if so, which method (form login, cookie, or auth header)

After collecting all inputs it shows a summary and asks for confirmation before running.

### CLI flags (for scripting / CI)

```bash
node bin/perf-test.js --url <url> [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--url` | *(required)* | Target URL to benchmark |
| `--iterations` | `10` | Number of requests per API tool |
| `--concurrency` | `5` | JMeter virtual user threads |
| `--output` | `./reports` | Directory to write report files |
| `--cookie` | — | Cookie header value, e.g. `"session=abc; token=xyz"` |
| `--auth-header` | — | Auth header, e.g. `"Authorization: Bearer abc123"` |
| `--login-url` | — | Login page URL for form-based auth (requires `--username` and `--password`) |
| `--username` | — | Username/email for form login |
| `--password` | — | Password for form login |
| `--company-id` | — | Company ID for form login (fills the `#CompanyId` input) |

### Examples

```bash
# Basic run
node bin/perf-test.js --url https://example.com

# High-iteration load test
node bin/perf-test.js --url https://api.example.com/endpoint --iterations 50 --concurrency 10

# Custom output directory
node bin/perf-test.js --url https://example.com --output ./my-reports

# Bearer token auth
node bin/perf-test.js --url https://api.example.com/secure \
  --auth-header "Authorization: Bearer eyJhbGci..."

# Cookie-based session
node bin/perf-test.js --url https://app.example.com/dashboard \
  --cookie "session=abc123; csrf=xyz"

# Form login (with company ID field)
node bin/perf-test.js --url https://app.example.com/dashboard \
  --login-url https://app.example.com/login \
  --username admin@example.com \
  --password secret \
  --company-id ACME
```

---

## Authentication

Pages behind a login are supported via three methods. Use whichever matches your site.

### `--cookie`
Injects a raw cookie string into **all four tools** as a `Cookie:` request header.

```bash
node bin/perf-test.js --url https://app.example.com/page \
  --cookie "session=abc123; remember_me=1"
```

Get your cookie string from browser DevTools → Application → Cookies, then copy the values for the domain.

### `--auth-header`
Injects a custom HTTP header into **Newman, JMeter, and Lighthouse**. Useful for APIs using Bearer tokens or API keys.

```bash
node bin/perf-test.js --url https://api.example.com/data \
  --auth-header "Authorization: Bearer eyJhbGci..."

node bin/perf-test.js --url https://api.example.com/data \
  --auth-header "X-API-Key: my-secret-key"
```

### `--login-url` + `--username` + `--password`
Puppeteer navigates to the login page, fills in the form, submits it, and captures the resulting session cookies. Those cookies are then used for **Chrome DevTools and Lighthouse** runs. All three flags must be provided together.

```bash
node bin/perf-test.js --url https://app.example.com/dashboard \
  --login-url https://app.example.com/login \
  --username admin@example.com \
  --password secret
```

The login flow fills in a `#CompanyId` field if `--company-id` is provided, then uses common selectors for the username/email and password fields, and submits via the page's submit button or Enter key.

> **Tip:** For maximum coverage behind a login wall, combine `--login-url` (for Puppeteer/Lighthouse) with `--cookie` or `--auth-header` (for Newman/JMeter).

### Auth support per tool

| Tool | `--cookie` | `--auth-header` | `--login-url` |
|---|---|---|---|
| Newman (Postman) | ✅ `Cookie:` header | ✅ Custom header | — |
| JMeter | ✅ `Cookie:` via Header Manager | ✅ Custom header | — |
| Chrome DevTools | ✅ `page.setCookie()` | ✅ `setExtraHTTPHeaders()` | ✅ Form login |
| Lighthouse | ✅ `extraHeaders` | ✅ `extraHeaders` | ✅ Form login |

---

## Output

### Console
A color-coded summary table printed to stdout immediately after the run. Thresholds follow [Web Vitals](https://web.dev/vitals/) standards (e.g. LCP < 2500ms = good).

### reports/results.json
Structured JSON with all raw metrics from every tool, including per-request timings.

### reports/report.html
A self-contained HTML report (no external dependencies) with:
- Dark sidebar navigation
- API response time table (Newman + JMeter)
- Page load metrics table (DevTools + Lighthouse)
- Lighthouse score cards (LCP, FCP, TTI, TBT, CLS, Performance Score)
- Collapsible methodology sections explaining how each metric is calculated

---

## How metrics are calculated

### API Response Time
Both Newman and JMeter measure **HTTP round-trip time** from the moment a request is sent to when the last byte of the response is received.

- **Newman** runs requests sequentially using Node.js `http`/`https`.
- **JMeter** runs requests across concurrent virtual user threads. Timing is JMeter's native `elapsed` column from its results CSV.

### Page Load Metrics
Both tools launch a **headless Chrome browser** and measure browser-level events, not raw HTTP timings.

- **Chrome DevTools (Puppeteer)** reads `window.performance.timing` via the Chrome DevTools Protocol:
  - `TTFB` = `responseStart - navigationStart`
  - `DOM Load` = `domContentLoadedEventEnd - navigationStart`
  - `Full Load` = `loadEventEnd - navigationStart`

- **Lighthouse** runs a full audit using Chrome's trace event profiler:
  - `LCP` — time until the largest above-fold element is visible
  - `FCP` — time to first contentful paint
  - `TTI` — time until the page is fully interactive
  - `TBT` — total main-thread blocking time
  - `CLS` — cumulative layout shift score

---

## Project structure

```
PerfTesting/
├── bin/
│   └── perf-test.js          # CLI entry point (yargs)
├── src/
│   ├── setup/
│   │   └── dependencies.js   # Auto-verifies tools; downloads JMeter if needed
│   ├── runners/
│   │   ├── newman.js         # Postman/Newman runner
│   │   ├── jmeter.js         # JMeter runner (generates JMX, parses CSV results)
│   │   ├── devtools.js       # Puppeteer + Chrome DevTools Protocol runner
│   │   └── lighthouse.js     # Lighthouse audit runner
│   ├── reporters/
│   │   ├── console.js        # Colored CLI table output
│   │   ├── json.js           # JSON file writer
│   │   └── html.js           # HTML report generator (Handlebars)
│   └── utils/
│       └── auth.js           # Cookie parsing, auth-header parsing, form login helper
├── templates/
│   └── report.html.template  # Self-contained HTML report template
├── vendor/                   # Auto-downloaded JMeter binary (gitignored)
└── reports/                  # Generated reports (gitignored)
```

---

## JMeter setup

JMeter is auto-downloaded to `vendor/apache-jmeter-5.6.3/` the first time the tool runs, provided Java is installed.

To install Java on Windows:
```bash
winget install Microsoft.OpenJDK.21
```

To install Java on macOS:
```bash
brew install openjdk@21
```

If you already have JMeter installed and on your `PATH`, the tool will use it directly without downloading.
