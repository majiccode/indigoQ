import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "build/site");
const origin = "https://majiccode.github.io";
const base = "/indigoQ/";
const repo = "https://github.com/majiccode/indigoQ";
const version = JSON.parse(readFileSync(path.join(root, "package.json"))).version;
const escape = text => String(text).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const guides = [
  {
    slug: "compare-pdf-documents-locally", title: "Compare two PDF documents locally", category: "Documents → previews → diff",
    description: "Preview two PDFs from one file workspace and compare their extracted text with indigoQ’s local visual workflow.",
    intro: "Keep two documents visible while comparing their text. Connect one FileWorkspace to two Document Preview workspaces, then send both previews to Diff / Compare.",
    steps: [
      ["Collect your documents", "Right-drag empty canvas to create a workspace. Choose FileWorkspace and drop your two PDFs into it. Files are stored as binaries on your machine, beside the saved graph."],
      ["Create two previews", "Create two Document Preview workspaces. Drag a wire from the FileWorkspace border to each preview. Use the Document source dropdown in each preview to select a different PDF."],
      ["Read the PDFs", "Open a preview fullscreen with its magnifying glass. Use Previous and Next to move through its pages. Each preview automatically publishes the selected document’s extracted text."],
      ["Compare their text", "Create a Diff / Compare workspace and connect both previews to it. Select the first preview as the left source and the second as the right source. Added and removed lines appear in the comparison."],
    ],
    note: "PDF comparison is text-based, not a visual page-layout comparison. Scanned PDFs can be viewed, but require OCR to supply comparison text; indigoQ does not currently include OCR.",
    related: "data-workbench", relatedName: "Data Workbench", image: null,
  },
  {
    slug: "csv-data-visualization", title: "Turn CSV data into interactive charts", category: "Tables → charts → selected rows",
    description: "Explore CSV data locally with indigoQ: edit tables, plot multiple series, select chart points, and export charts and data.",
    intro: "Go from a spreadsheet-style table to a chart you can explore. The bundled Chart Studio example connects weekly sales data, a multi-series chart, selected rows, and a file export workspace.",
    steps: [
      ["Start with Chart Studio", "Open the file-menu icon in the header, choose Examples, then Chart Studio. This replaces the current canvas, so save your current graph first if you want to keep it."],
      ["Bring your own CSV", "Open the Weekly Sales Data Table workspace and use Open file to load a CSV. You can also edit the supplied sales cells directly to see connected chart values change."],
      ["Choose your plot", "Open Weekly Sales Chart fullscreen. Select the source table, X and Y columns, and an optional series column. Try line, scatter, bar, or histogram views."],
      ["Select and export", "Drag across the plot to brush points, then publish selected rows. Import that chart output into Selected Rows for further work. Export PNG or SVG for reports; PNG export also saves an image into the connected Chart Exports workspace."],
    ],
    note: "The chart follows saved table edits when Auto-update is enabled. Publishing a selection creates a table snapshot you can use in another workspace.",
    related: "chart-studio", relatedName: "Chart Studio", image: "chart-studio.png",
  },
  {
    slug: "local-ai-workflows-ollama", title: "Build a local AI workflow with Ollama", category: "Local models → structured data → analysis",
    description: "Connect Ollama to a visual workflow in indigoQ to turn prompts into equations or structured JSON, then inspect the results locally.",
    intro: "Use a locally running Ollama model as one step in a visible pipeline. indigoQ lets you connect AI output to text editors, mathematical plots, JSON transforms, tables, and reports.",
    steps: [
      ["Run Ollama locally", "Install Ollama separately and download a model, for example with ollama pull llama3.2. Start Ollama; indigoQ uses http://127.0.0.1:11434 by default. AI features require Ollama, but the rest of indigoQ does not."],
      ["Load Local AI Studio", "In indigoQ, choose the file-menu icon, Examples, then Local AI Studio. Save any existing canvas first. The example includes connected AI, equation, and JSON/data workflows."],
      ["Select a model and run a prompt", "Open an Ollama workspace, refresh the model list, and choose an installed model. Review the prompt and connected context, then press Run. Model generation starts explicitly, rather than automatically."],
      ["Inspect and transform the result", "Review generated equations in the connected editor and Math Lab. For the JSON workflow, check the response, run its connected transform, and import the structured output into a Data Table. Treat model responses as drafts you can inspect and edit."],
    ],
    note: "With a local Ollama model and local inputs, this workflow runs on your computer. HTTP workspaces and any external URLs you configure can still access network services.",
    related: "local-ai", relatedName: "Local AI Studio", image: "oscillator-lab.png",
  },
];

function layout({ title, description, slug = "", body, article = false }) {
  const url = `${origin}${base}${slug ? `${slug}/` : ""}`;
  const schema = article ? {
    "@context": "https://schema.org", "@type": "TechArticle", headline: title, description,
    url, author: { "@type": "Person", name: "Paul Adams", url: "https://github.com/majiccode" },
    about: { "@type": "SoftwareApplication", name: "indigoQ", url: origin + base }, inLanguage: "en",
  } : {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: "indigoQ", url,
    description, applicationCategory: "DeveloperApplication", operatingSystem: "macOS, Windows, Linux",
    softwareVersion: version, downloadUrl: repo + "/releases/latest", codeRepository: repo,
    screenshot: origin + base + "images/interactive-studio.png", isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "Paul Adams", url: "https://github.com/majiccode" },
    featureList: ["Infinite visual workspace canvas", "PDF preview and text comparison", "CSV tables and interactive charts", "Local AI through Ollama", "Live equations and simulations"],
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}${article ? " | indigoQ" : ""}</title>
<meta name="description" content="${escape(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}"><link rel="icon" type="image/svg+xml" href="${base}icon.svg"><link rel="stylesheet" href="${base}style.css">
<meta property="og:type" content="${article ? "article" : "website"}"><meta property="og:site_name" content="indigoQ"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}${base}images/interactive-studio.png"><meta property="og:image:alt" content="indigoQ canvas with connected controls, simulation, and dashboard">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${origin}${base}images/interactive-studio.png">
<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script></head>
<body><a class="skip" href="#main">Skip to content</a>
<header class="header"><a class="brand" href="${base}"><img src="${base}icon.svg" width="36" height="36" alt=""><span>indigoQ</span></a><nav aria-label="Main navigation"><a href="${base}#examples">Examples</a><a href="${base}#guides">Guides</a><a href="${repo}">GitHub ↗</a><a class="button small" href="${base}#download">Download</a></nav></header>
<main id="main">${body}</main>
<footer><a class="brand" href="${base}">indigoQ</a><p>Built by <a href="https://github.com/majiccode">Paul Adams</a>. A visual workbench, on your machine.</p><div><a href="${repo}">Source code</a><a href="${repo}/issues">Feedback</a><a href="https://paypal.me/pdgadams">Support via PayPal ↗</a></div></footer>
</body></html>\n`;
}

rmSync(output, { recursive: true, force: true });
mkdirSync(path.join(output, "images"), { recursive: true });
cpSync(path.join(root, "docs/screenshots"), path.join(output, "images"), { recursive: true });
cpSync(path.join(root, "frontend/src/app/icon.svg"), path.join(output, "icon.svg"));
cpSync(path.join(root, "site/style.css"), path.join(output, "style.css"));
const body = `<section class="hero wrap"><div class="eyebrow">VISUAL WORKFLOWS · LOCAL-FIRST · OPEN SOURCE</div>
<h1>Your ideas.<br>Your data.<br><span>Connected.</span></h1>
<p class="lead">indigoQ is a local-first visual workbench for files, data, and AI. Connect workspaces on an infinite canvas to explore documents, build charts, and experiment with local models.</p>
<div class="actions"><a class="button" href="#download">Download indigoQ <span aria-hidden="true">↓</span></a><a class="text-link" href="#examples">See what you can build →</a></div><p class="muted">Free portable builds for macOS, Windows, and Linux. No Node or Python install needed.</p></section>
<figure class="hero-image wrap"><img src="${base}images/interactive-studio.png" width="1760" height="1080" alt="indigoQ infinite canvas connecting shared controls, a spring simulation, an HTML playground, a live curve, and an experiment dashboard" fetchpriority="high"><figcaption>One canvas. Connected controls, simulations, equations, and dashboards.</figcaption></figure>
<section class="wrap section" id="examples"><div class="eyebrow">LESS SETUP. MORE EXPLORING.</div><h2>A small workspace for each big idea.</h2><p class="intro">Start from a bundled example, connect the pieces, and make it your own.</p>
<div class="feature-grid"><article class="card"><span class="tag">01 / DATA</span><h3>From rows to insight</h3><p>Edit tables, compare chart series, brush points, and export the results. Keep your data flow visible as it grows.</p><a href="${base}csv-data-visualization/">Explore CSV & chart workflows →</a></article><article class="card"><span class="tag">02 / DOCUMENTS</span><h3>Read. Connect. Compare.</h3><p>Preview PDFs and Markdown, pick different files in separate workspaces, and compare their extracted text.</p><a href="${base}compare-pdf-documents-locally/">Compare two PDFs locally →</a></article><article class="card"><span class="tag">03 / LOCAL AI</span><h3>Give your model a workbench</h3><p>Connect Ollama output to equations, JSON transforms, and tables. Inspect each step and keep control of what runs.</p><a href="${base}local-ai-workflows-ollama/">Build an Ollama workflow →</a></article></div>
<div class="showcase"><img src="${base}images/chart-studio.png" width="1280" height="1200" loading="lazy" alt="Chart Studio plotting weekly sales for North and South regions with chart controls and export tools"><div><div class="eyebrow">CHART STUDIO</div><h2>Your data has a story.<br>Find its shape.</h2><p>Line, scatter, bar, and histogram charts. Multiple series. Selection brushes. Exportable images and data.</p><a class="text-link" href="${base}csv-data-visualization/">Follow the charting guide →</a></div></div>
<div class="showcase reverse"><img src="${base}images/oscillator-lab.png" width="1280" height="1200" loading="lazy" alt="Oscillator Lab with amplitude, frequency, and damping knobs controlling a damped sine wave"><div><div class="eyebrow">OSCILLATOR LAB</div><h2>Make equations<br>feel tangible.</h2><p>Connect a text editor to a live mathematical plot. Turn amplitude, frequency, and damping knobs, then export sampled curves.</p><p>Load <strong>Oscillator Lab</strong> from the Examples menu to try it.</p><a class="text-link" href="${repo}/blob/main/frontend/public/examples/oscillator-lab.json">View the example graph →</a></div></div></section>
<section class="band"><div class="wrap section"><div class="eyebrow">A WORKBENCH THAT RUNS WHERE YOU DO</div><h2>Local by default.<br>Flexible by design.</h2><div class="feature-grid compact"><div><h3>Keep your files nearby</h3><p>The app runs on your machine. Uploaded files live beside the graph as binaries, organized by workspace.</p></div><div><h3>Choose when AI runs</h3><p>Ollama is optional and installed separately. Local models run explicitly; HTTP tools can connect to services you choose.</p></div><div><h3>Take your work with you</h3><p>Save a portable JSON export with your graph and files. Load it later or share it with someone else.</p></div></div></div></section>
<section class="wrap section" id="guides"><div class="eyebrow">PICK A FIRST PROJECT</div><h2>A useful workflow in a few steps.</h2><div class="guide-list">${guides.map(guide => `<a href="${base}${guide.slug}/"><span>${escape(guide.category)}</span><h3>${escape(guide.title)}</h3><span aria-hidden="true">↗</span></a>`).join("")}</div></section>
<section class="wrap section download" id="download"><div class="eyebrow">READY WHEN YOU ARE</div><h2>Download. Unpack. Connect.</h2><p class="intro">Get the latest free portable release. The bundle includes the frontend, backend, and Python runtime.</p><div class="actions"><a class="button" href="${repo}/releases/latest">Download for macOS, Windows & Linux ↗</a><a class="text-link" href="${repo}/blob/main/docs/INSTALL.md">Installation guide →</a></div><ol class="quick-start"><li>Choose the archive for your operating system and unpack it.</li><li>Launch <strong>Start indigoQ</strong> from the extracted folder.</li><li>Open the local address shown by the launcher, normally <code>http://127.0.0.1:8787</code>.</li><li>Choose the file-menu icon → <strong>Examples</strong> to explore a ready-made canvas.</li></ol><p class="muted">The website is a guide to the app. Your workspace runs locally after download.</p></section>
<section class="wrap section faq"><h2>A few things to know.</h2><details><summary>Is indigoQ free?</summary><p>Yes. The source and portable releases are freely available on GitHub. If it saves you time, you can <a href="https://paypal.me/pdgadams">support development via PayPal</a>.</p></details><details><summary>Do I need Ollama?</summary><p>Only for local AI features. Tables, charts, PDF previews, text comparison, mathematical plots, and the canvas work without it.</p></details><details><summary>Can I compare scanned PDFs?</summary><p>You can preview scanned PDFs. Text comparison requires extractable text; OCR is not currently included.</p></details><details><summary>Where should I send feedback?</summary><p>Please <a href="${repo}/issues">open a GitHub issue</a> with what you tried, your operating system, and any error message. Small, specific examples are especially helpful.</p></details></section>`;
writeFileSync(path.join(output, "index.html"), layout({ title: "indigoQ — Local-first visual workbench for files, data & AI", description: "Connect files, PDF previews, charts, equations, and local AI on an infinite canvas. Download indigoQ free for macOS, Windows, and Linux.", body }));
for (const guide of guides) {
  mkdirSync(path.join(output, guide.slug), { recursive: true });
  const body = `<article class="wrap article"><a class="breadcrumb" href="${base}">← indigoQ</a><div class="eyebrow">${escape(guide.category)}</div><h1>${escape(guide.title)}</h1><p class="lead">${escape(guide.intro)}</p><p>Before you start, <a href="${base}#download">download and launch indigoQ</a>. The app runs on your own computer.</p>${guide.image ? `<figure><img src="${base}images/${guide.image}" width="1280" height="1200" alt="${guide.slug === "csv-data-visualization" ? "Chart Studio with weekly sales plotted across two regions" : "An example of live equations and mathematical plots in indigoQ"}"><figcaption>${guide.slug === "csv-data-visualization" ? "The bundled Chart Studio example, opened fullscreen." : "Math Lab: one destination for equations in a local AI workflow."}</figcaption></figure>` : `<div class="flow" aria-label="Workflow">FileWorkspace → two Document Previews → Diff / Compare</div>`}<ol class="steps">${guide.steps.map(([title, text]) => `<li><h2>${escape(title)}</h2><p>${escape(text)}</p></li>`).join("")}</ol><aside class="note"><h2>Good to know</h2><p>${escape(guide.note)}</p></aside><h2>Keep exploring</h2><p>Try the bundled <strong>${guide.relatedName}</strong> example from the file-menu icon → Examples. <a href="${repo}/blob/main/frontend/public/examples/${guide.related}.json">View its saved graph on GitHub</a>.</p><div class="actions"><a class="button" href="${base}#download">Get indigoQ ↓</a><a href="${repo}/issues">Questions or feedback?</a></div><nav class="related" aria-label="More workflow guides">${guides.filter(item => item !== guide).map(item => `<a href="${base}${item.slug}/">${escape(item.title)} →</a>`).join("")}</nav></article>`;
  writeFileSync(path.join(output, guide.slug, "index.html"), layout({ ...guide, body, article: true }));
}
writeFileSync(path.join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", ...guides.map(guide => guide.slug + "/")].map(slug => `<url><loc>${origin}${base}${slug}</loc></url>`).join("")}</urlset>\n`);
writeFileSync(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${origin}${base}sitemap.xml\n`);
writeFileSync(path.join(output, ".nojekyll"), "");
console.log(`Built indigoQ website: ${output} (${guides.length + 1} pages)`);
