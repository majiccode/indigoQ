# Public project website

Live at **https://majiccode.github.io/indigoQ/** using free GitHub Pages hosting.

Build locally with:

```sh
node scripts/build-site.mjs
```

Generated pages and assets go into `build/site/` (ignored by Git). The builder
contains the landing-page and guide content, per-page SEO metadata, structured
data, and sitemap. Styles live in `site/style.css`; images come from
`docs/screenshots/`. No application server or package installation is required
to build this website.

The **Website** workflow deploys changes to the site, builder, screenshots, icon,
or package version when pushed to `main`. It can also be run manually in Actions.
It publishes the website, not the local application.

## Search indexing

- Sitemap: https://majiccode.github.io/indigoQ/sitemap.xml
- Add `https://majiccode.github.io/indigoQ/` as a URL-prefix property in Google
  Search Console. Verify ownership using Google's HTML file or meta tag, then
  submit `sitemap.xml`. The verification requires access to the owner's Google
  account; add the supplied verification file to the builder's output or its
  meta tag to the shared page head before publishing.
- The same site can be registered in Bing Webmaster Tools.
- `robots.txt` is published inside the project directory for reference, but
  crawlers use the host-root `https://majiccode.github.io/robots.txt`. A missing
  host-root robots file does not prevent crawling. Do not add a host-root rule
  blocking `/indigoQ/` in the separate `majiccode.github.io` repository.

Indexing and placement in search or AI answers are controlled by the individual
services and are not immediate or guaranteed.
