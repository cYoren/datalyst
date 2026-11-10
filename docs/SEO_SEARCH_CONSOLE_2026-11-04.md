# Search Console follow-up, 2026-11-04

Status: current

The public site, canonical host and sitemap were already fixed in #25. The remaining issue was an indexed registration page with no noindex instruction.

- The auth route group now renders `noindex, follow` for login, registration and password recovery. These three URLs are crawlable so search engines can read the instruction. Protected data routes remain disallowed and authenticated.
- The sitemap omits `lastmod` until real content revisions are tracked, rather than marking every build as a content update.
- Validation: production build; lint on changed files; 277 existing tests pass, two database integration tests intentionally skip without a test database. The full repository lint still reports seven pre-existing errors in unrelated UI modules; no new suppression or behavior changes were made.
- Verify the deployed auth HTML, robots.txt and sitemap after the Git-backed Cloudflare deployment. Google removes old auth results after recrawling; submission alone does not immediately change the index.
