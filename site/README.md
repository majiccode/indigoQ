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

## Editing workflow guides

The homepage's **Watch indigoQ in action** section embeds the narrated introduction
at https://www.youtube.com/watch?v=347NDTBdziw using a responsive, lazy-loaded
YouTube privacy-enhanced player. It has no autoplay and includes a direct
YouTube link. Update both links in `scripts/build-site.mjs` and the README when
replacing the video.

The landing page highlights data, documents, local AI, and **Creative Workshop**.
Its **visual tour** uses accessible expandable walkthroughs and an actual app
screenshot to demonstrate PDF read-aloud, chart exports, local AI, and 3D scenes.
These are illustrations and guides, rather than a hosted instance of the app.
Creative guides cover ASCII Art, Ambient Mood, USB Debug, Electronic Workshop,
and the 3D Modeler → World Builder pipeline. The shared starter graph is
`frontend/public/examples/creative-workshop.json`.

Guide copy lives in the `guides` array in `scripts/build-site.mjs`. Each guide
needs a unique `slug`, title, category, description, introduction, steps, and
note. Optional `image` values name files in `docs/screenshots/`.

Set `flow` for a text workflow diagram when a guide has no screenshot. Only set
`related` and `relatedName` when the referenced JSON actually exists in
`frontend/public/examples/`. Guides without a bundled example link to the
[workspace reference](../docs/WORKSPACES.md) instead.

After editing, run the builder and check `build/site/index.html`, the changed
guide pages, and `build/site/sitemap.xml`. Keep public instructions consistent
with the README and workspace reference, including prototype behavior.

The builder rejects duplicate guide slugs and missing referenced example/image
files. Guides and their links are included automatically in the landing-page
guide list, related-guide navigation, and sitemap.

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
