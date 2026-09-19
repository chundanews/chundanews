# CHUNDA KSHETRA NEWS — Deployment & Security Checklist

This build fixes application-side issues in the uploaded project. A few controls are necessarily configured in Firebase/Cloudflare, not inside static HTML.

## 1. Firebase App Check (required)

Firebase Console → App Check → your Web app:
- Use reCAPTCHA Enterprise for the production domain `https://chundanewslive.in`.
- Verify the production domain is registered/allowed for the reCAPTCHA key.
- Monitor App Check metrics first.
- Then enable enforcement for **Cloud Firestore** and **Cloud Storage**.

The `fcm_subscribers` Firestore rule now requires `request.app != null`, so App Check enforcement is important for notification subscriptions.

## 2. Firebase Storage

This build stores uploaded news images and election PDFs in Firebase Storage instead of Firestore documents.
Deploy `storage.rules` and make sure Storage is enabled for the `chunda-news` Firebase project.

Recommended Firebase CLI commands from the project root:

    firebase deploy --only firestore:rules,storage

If your Firebase project is not linked in the local CLI, select/link the existing `chunda-news` project before deploying.

## 3. Firestore

Deploy `firestore.rules` after reviewing the designated admin UID. The application uses:

    q9yvlsTLBtYgdii6QQjTeGkb4rv2

as the only admin UID.

Do not publish service-account JSON files, private keys, Firebase Admin SDK credentials, Cloudflare API tokens, or other secrets.

## 4. Cloudflare response security headers

Because the site is served from GitHub/static hosting, HTML `<meta>` CSP is only a fallback. Prefer real HTTP response headers in Cloudflare.

Recommended headers:
- Strict-Transport-Security: `max-age=31536000; includeSubDomains`
- X-Content-Type-Options: `nosniff`
- Referrer-Policy: `strict-origin-when-cross-origin`
- Permissions-Policy: `camera=(), microphone=(self), geolocation=(), payment=()`
- X-Frame-Options: `SAMEORIGIN`

For CSP, use a Cloudflare response-header rule after testing. The current app still relies on Tailwind CDN and inline application code, so a strict nonce/hash CSP should be introduced only after moving the app to a build pipeline and removing `unsafe-inline`/`unsafe-eval`.

## 5. SEO limitation of this static SPA

The build now updates title, canonical, Open Graph, Twitter metadata and NewsArticle JSON-LD when a news article is opened. However, this does **not** turn `?news_id=` into a server-rendered, independently crawlable article page.

For full Google News/SEO architecture, migrate article rendering to SSR/SSG (for example Next.js/Astro) or generate static `/news/...` pages during deployment. The Firebase data model can remain the backend.

## 6. Sitemap

The checked-in `sitemap.xml` contains the homepage only. It is not possible for a static file to automatically enumerate new Firestore articles. A deployment-time sitemap generator or server/edge function should generate article URLs and a news sitemap.
