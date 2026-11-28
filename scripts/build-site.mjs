import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    slug: "preview-connected-videos", title: "Watch connected videos on your canvas", category: "Video files → preview / dashboard",
    description: "Preview video files in indigoQ's Document Preview, FileWorkspace viewer, and Dashboard with native playback controls and download fallback.",
    intro: "Keep a video beside your documents, notes, and data. Connect its FileWorkspace to Document Preview or Dashboard and start playback when you are ready.",
    flow: "FileWorkspace → Document Preview / Dashboard",
    steps: [
      ["Add a video", "Drop a video file into a FileWorkspace. You can open the file directly in that workspace's viewer, or connect it to Document Preview."],
      ["Choose and play", "In Document Preview, select the video from Document source. Use the native player controls for playback, seeking, volume, and fullscreen where your browser supports it. Videos do not autoplay."],
      ["Keep it alongside your work", "Connect FileWorkspace → Dashboard to display video with your other cards. Use Download to open the original file in another player if the browser cannot decode it."],
    ],
    note: "Playback depends on the browser's supported formats and codecs. A video does not publish extracted document text or a transcript. Selecting video in Document Preview clears the previous text output; PDF text-to-speech remains a separate workflow.",
    image: null,
  },
  {
    slug: "listen-to-pdf-documents", title: "Listen to your PDF documents", category: "PDF → document text → speech",
    description: "Read PDF documents aloud with indigoQ: connect Document Preview to Text to Speech and choose a browser voice, rate, and pitch. No Ollama model required.",
    intro: "Give your eyes a break. Drop in a PDF, connect its extracted text to Text to Speech, and listen using your browser’s speech synthesis.",
    flow: "FileWorkspace → Document Preview → Text to Speech",
    steps: [
      ["Add a PDF", "Create a FileWorkspace and drop in a PDF containing selectable text. Create a Document Preview and wire the FileWorkspace to it."],
      ["Choose the document", "Open Document Preview fullscreen, select the PDF in the document-source selector, and wait for text extraction to finish."],
      ["Connect and listen", "Create a Text to Speech workspace and connect Document Preview → Text to Speech. Choose a voice, rate, and pitch, then click Speak it all. Click Stop to cancel playback."],
      ["Try other text sources", "The same speech workspace can read a TextEditor or Ollama response. For a live text source, Follow reads text added after you activate it."],
    ],
    note: "Text to Speech uses browser speech synthesis; Ollama is not required. Voices depend on your browser and operating system. Scanned PDFs need OCR to supply text, and indigoQ does not currently include OCR. The reading follows extracted text order, which may differ from a complex page layout.",
    image: null,
  },
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
  {
    slug: "ascii-art-images-to-text", title: "Turn images and tables into ASCII art", category: "Files → ASCII art → text",
    description: "Render connected images as ASCII or braille characters, and tables as sparklines. Output is text — wire it anywhere text is accepted.",
    intro: "Turn a picture into characters, or a data table into a compact sparkline strip. Publish the text to Document Preview or save a TXT snapshot into connected FileWorkspaces.",
    flow: "FileWorkspace / Data Table → ASCII Art → Document Preview",
    steps: [
      ["Connect an image source", "Drop an image into a FileWorkspace, then wire it to an ASCII Art workspace. Choose Image → ASCII mode, pick ASCII or Braille style, and adjust contrast, brightness, and column count until the preview looks right."],
      ["Publish or download the text", "Click Publish TXT to save the art as a text file into any connected FileWorkspace, or Download TXT to save it locally. The output flows like any other text source."],
      ["Send it downstream", "Wire ASCII Art → Document Preview to embed art in a report. Table mode accepts a connected Data Table or Math Lab and supports both Publish TXT and Download TXT. Character art represents shapes, rather than describing the original image."],
    ],
    note: "ASCII art is text, not an image. Auto-contrast stretches each image’s tonal range by default, but use the Contrast slider if the preview looks washed out.",
    related: "creative-workshop", relatedName: "Creative Workshop", image: null,
  },
  {
    slug: "ambient-mood-from-text", title: "Drive ambient controls from document sentiment", category: "Text → controls → ambient",
    description: "Derive ambient control values (mood color, intensity, tempo, brightness, saturation) from connected text keywords or table statistics.",
    intro: "Analyze emotional keywords or table statistics and turn them into named control values. Inspect the result in Dashboard or consume the mood values in an HTML Playground.",
    flow: "TextEditor / Data Table → Ambient Mood → Dashboard / HTML Playground",
    steps: [
      ["Connect a text or table source", "Wire Document Preview, TextEditor, Ollama, or Data Table → Ambient Mood. The workspace reads the connected text or table automatically."],
      ["Watch the mood build", "Text is scanned for emotional keywords (happy → yellow, calm → cyan, sad → blue, mysterious → purple). Tables are scored by variance and mean. The result shows as a color swatch in the header."],
      ["Wire controls downstream", "Connect Ambient Mood → Dashboard to inspect moodColor, intensity, tempo, brightness, saturation, and active. HTML Playground can read these names from connected controls. Other tools respond only to matching parameter names."],
    ],
    note: "Auto mood updates built-in values while preserving your control definitions. Moving a control switches to manual mode; enable Auto mood to resume analysis. This is keyword-based analysis.",
    related: "creative-workshop", relatedName: "Creative Workshop", image: null,
  },
  {
    slug: "usb-debug-devices", title: "Read and write USB devices", category: "USB → text → downstream",
    description: "Interrogate USB devices from the browser: connect, claim interfaces, read/write endpoints, view traffic as hex and ASCII.",
    intro: "Talk directly to USB hardware from indigoQ. Connect a device, claim its interface, read incoming bytes, or send commands — all as text you can wire anywhere.",
    flow: "USB device → USB Debug → Document Preview / Ollama",
    steps: [
      ["Connect a device", "Create a USB Debug workspace and click Connect USB Device. Choose your device from the browser chooser and approve access. Chrome or Edge on desktop/Android, served over localhost or HTTPS."],
      ["Explore interfaces", "Click Explore Interfaces to list the device’s interfaces and their IN/OUT endpoints, then claim the interface you want to use."],
      ["Read and write", "Click Read Once to grab 64 bytes, or Start Read to poll continuously. Type hex bytes (DE AD BE EF) and click Send to write to the OUT endpoint. Traffic appears as hex + ASCII with timestamps."],
      ["Wire downstream", "USB Debug publishes text output — connect it to Document Preview to inspect, Text to Speech to hear readings aloud, or Ollama to interpret device data."],
    ],
    note: "Stop Read prevents further queued reads; an in-flight transfer may finish when device data arrives. Disconnect closes the device. WebUSB requires browser approval; Windows may need a WinUSB driver for the claimed interface.",
    related: "creative-workshop", relatedName: "Creative Workshop", image: null,
  },
  {
    slug: "electronic-workshop-circuits", title: "Build and share circuit designs", category: "Parts → connections → design JSON",
    description: "Arrange circuit components, connect pins, check connectivity, and export designs and planning notes with Electronic Workshop.",
    intro: "Keep parts and wiring visible while planning a device. Electronic Workshop includes component templates, sample circuits, and JSON exports.",
    flow: "Electronic Workshop → circuit JSON / planning notes → FileWorkspace",
    steps: [
      ["Start a circuit", "Load Creative Workshop from the app’s Examples menu, then open Electronic Workshop fullscreen. Add parts or choose Blink LED or LCD Controller from the workspace’s example selector."],
      ["Arrange and connect", "Drag parts, edit labels and values, and rotate selected components. Click two pins to connect them. Double-click a wire to remove it, or delete a selected part and its wires."],
      ["Check and export", "Test circuit checks basic power/ground connectivity and direct shorts. Save design publishes circuit JSON and saves it into outgoing FileWorkspaces. Manufacturing package exports a text planning document with a BOM, nets, and placement notes."],
    ],
    note: "Connectivity checks are not an electrical simulation. The planning package is a text document, not fabrication-ready Gerber/drill files. Ask AI prepares a prompt for an explicit Ollama run.",
    related: "creative-workshop", relatedName: "Creative Workshop", image: null,
  },
  {
    slug: "3d-models-and-worlds", title: "Compose a scene from reusable 3D models", category: "Meshes → instances → portable scene",
    description: "Create meshes in 3D Modeler, place them in World Builder, and export a scene with geometry and transforms.",
    intro: "Make a model, inspect it in a perspective view, and place instances in a scene. Model and scene edits are saved with your graph.",
    flow: "3D Modeler → World Builder → scene JSON / FileWorkspace",
    steps: [
      ["Create a model", "Load Creative Workshop, or add a 3D Modeler. Add sample meshes or import model JSON, edit mesh names and colors, then try view transforms, Solid, Culling, and Spin."],
      ["Publish and place", "Export model publishes a reusable snapshot. Connect 3D Modeler → World Builder and use Place mesh-name to add instances. Connected model exports refresh World Builder’s asset list."],
      ["Arrange and export the scene", "Edit each instance’s position, rotation, and scale along all three axes, or toggle visibility. Export world includes mesh geometry in the scene JSON and saves it into connected outgoing FileWorkspaces."],
    ],
    note: "Model view controls adjust the preview; mesh geometry remains reusable. Export is explicit, and spin starts only on a click. Scene exports include assets so they can be imported independently.",
    related: "creative-workshop", relatedName: "Creative Workshop", image: null,
  },
];

const guideSlugs = new Set();
for (const guide of guides) {
  if (guideSlugs.has(guide.slug)) throw new Error(`Duplicate guide slug: ${guide.slug}`);
  guideSlugs.add(guide.slug);
  if (guide.related && !existsSync(path.join(root, "frontend/public/examples", `${guide.related}.json`))) throw new Error(`Missing example for ${guide.slug}: ${guide.related}`);
  if (guide.image && !existsSync(path.join(root, "docs/screenshots", guide.image))) throw new Error(`Missing guide image: ${guide.image}`);
}

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
    featureList: ["Infinite visual workspace canvas", "PDF preview, text comparison, and read-aloud speech", "CSV tables and interactive charts", "Local AI through Ollama", "Live equations and simulations", "Circuit editing and connectivity checks", "3D modeling and scene composition", "ASCII and Braille art", "Text-derived ambient controls", "Browser USB debugging"],
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
<header class="header"><a class="brand" href="${base}"><img src="${base}icon.svg" width="36" height="36" alt=""><span>indigoQ</span></a><nav aria-label="Main navigation"><a href="${base}#examples">Examples</a><a href="${base}#guides">Guides</a><a href="${repo}">GitHub ↗</a><a class="button small donate" href="https://paypal.me/pdgadams"><span aria-hidden="true">♡</span> Donate</a><a class="button small" href="${base}#download">Download</a></nav></header>
<main id="main">${body}</main>
<footer><a class="brand" href="${base}">indigoQ</a><p>Built by <a href="https://github.com/majiccode">Paul Adams</a>. A visual workbench, on your machine.</p><div><a href="${repo}">Source code</a><a href="${repo}/issues">Feedback</a><a href="https://paypal.me/pdgadams">Support via PayPal ↗</a></div></footer>
</body></html>\n`;
}

rmSync(output, { recursive: true, force: true });
mkdirSync(path.join(output, "images"), { recursive: true });
cpSync(path.join(root, "docs/screenshots"), path.join(output, "images"), { recursive: true });
cpSync(path.join(root, "frontend/src/app/icon.svg"), path.join(output, "icon.svg"));
cpSync(path.join(root, "site/style.css"), path.join(output, "style.css"));
cpSync(path.join(root, "site/google8ee8483728291f13.html"), path.join(output, "google8ee8483728291f13.html"));
const body = `<section class="hero wrap"><div class="eyebrow">VISUAL WORKFLOWS · LOCAL-FIRST · OPEN SOURCE</div>
<h1>Small tools.<br><span>Big connections.</span></h1>
<p class="lead">Listen to a PDF. Turn a spreadsheet into a chart. Give your local AI a workspace. indigoQ brings your documents, data, and ideas together on one visual canvas—on your computer.</p>
<div class="actions"><a class="button" href="#download">Get indigoQ — free <span aria-hidden="true">↓</span></a><a class="text-link" href="#tour">Take the visual tour →</a></div><ul class="launch-facts" aria-label="About indigoQ"><li>Free & open source</li><li>macOS · Windows · Linux</li><li>Ollama optional</li><li>No Node or Python setup</li></ul></section>
<figure class="hero-image wrap"><img src="${base}images/interactive-studio.png" width="1760" height="1080" alt="indigoQ infinite canvas connecting shared controls, a spring simulation, an HTML playground, a live curve, and an experiment dashboard" fetchpriority="high"><figcaption>One canvas. Connected controls, simulations, equations, and dashboards.</figcaption></figure>
<section class="wrap section" id="watch" aria-labelledby="watch-title"><div class="eyebrow">AN INTRODUCTION IN UNDER TWO MINUTES</div><h2 id="watch-title">Watch indigoQ in action.</h2><p class="intro">See how documents, charts, equations, and creative tools connect. This narrated introduction uses app screenshots and an illustrated PDF read-aloud workflow.</p><div class="youtube-player"><iframe src="https://www.youtube-nocookie.com/embed/347NDTBdziw" title="indigoQ introduction — documents, data, and connected tools" width="1280" height="720" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><div class="actions"><a class="text-link" href="https://www.youtube.com/watch?v=347NDTBdziw">Watch on YouTube ↗</a><a class="button" href="#download">Try indigoQ — free ↓</a></div></section>
<section class="wrap section" id="tour" aria-labelledby="tour-title"><div class="eyebrow">SEE THE CONNECTION. SEE THE RESULT.</div><h2 id="tour-title">What would you like to make?</h2><p class="intro">Choose a workflow below. These are illustrated walkthroughs; download the app to try them with your own files.</p>
<div class="workflow-tour">
<details class="tour-item" open><summary><span class="tour-number">01</span><span>Listen to a document<small>Your PDF, a preview, and a voice.</small></span></summary><div class="tour-content"><div class="workflow-strip" aria-label="PDF reading workflow"><div><span class="node-symbol" aria-hidden="true">▤</span><strong>FileWorkspace</strong><small>Add your PDF</small></div><span class="node-arrow" aria-hidden="true">→</span><div><span class="node-symbol" aria-hidden="true">▥</span><strong>Document Preview</strong><small>Select and extract text</small></div><span class="node-arrow" aria-hidden="true">→</span><div><span class="node-symbol" aria-hidden="true">♫</span><strong>Text to Speech</strong><small>Choose a voice. Press Play.</small></div></div><h3>A useful first connection.</h3><p>Click <strong>Speak it all</strong> to hear your document, and adjust voice, speed, and pitch. No AI model is needed. PDFs need extractable text; scanned pages require OCR.</p><a class="text-link" href="${base}listen-to-pdf-documents/">Try the PDF read-aloud workflow →</a></div></details>
<details class="tour-item"><summary><span class="tour-number">02</span><span>Find the story in your data<small>A table, a chart, and a result you can share.</small></span></summary><div class="tour-content"><div class="workflow-strip" aria-label="Chart workflow"><div><strong>Data Table</strong><small>Open or edit a CSV</small></div><span class="node-arrow" aria-hidden="true">→</span><div><strong>Chart Studio</strong><small>Plot. Compare. Select.</small></div><span class="node-arrow" aria-hidden="true">→</span><div><strong>Export Files</strong><small>Save your chart PNG</small></div></div><img class="tour-screenshot" src="${base}images/chart-studio.png" width="1280" height="1200" loading="lazy" alt="Actual Chart Studio screenshot showing weekly sales for two regions"><p>Change chart types, compare series, brush points, and export selected rows. Load <strong>Examples → Chart Studio</strong> for a ready-made project.</p><a class="text-link" href="${base}csv-data-visualization/">Explore your first chart →</a></div></details>
<details class="tour-item"><summary><span class="tour-number">03</span><span>Make local AI part of your work<small>A model response you can inspect and use.</small></span></summary><div class="tour-content"><div class="workflow-strip" aria-label="Local AI workflow"><div><strong>Ollama</strong><small>Run a local model</small></div><span class="node-arrow" aria-hidden="true">→</span><div><strong>Transform</strong><small>Extract structured JSON</small></div><span class="node-arrow" aria-hidden="true">→</span><div><strong>Data Table</strong><small>Inspect the records</small></div></div><p>See the output at each step. Generate explicitly, inspect the response, then transform it into data you can work with. Ollama and models are installed separately.</p><a class="text-link" href="${base}local-ai-workflows-ollama/">Build a local AI workflow →</a></div></details>
<details class="tour-item"><summary><span class="tour-number">04</span><span>Explore something creative<small>Circuits, reusable models, scenes, and character art.</small></span></summary><div class="tour-content"><div class="workflow-strip" aria-label="3D scene workflow"><div><strong>3D Modeler</strong><small>Create and publish meshes</small></div><span class="node-arrow" aria-hidden="true">→</span><div><strong>World Builder</strong><small>Place and transform instances</small></div><span class="node-arrow" aria-hidden="true">→</span><div><strong>Scene JSON</strong><small>Export with geometry</small></div></div><p>Load <strong>Examples → Creative Workshop</strong> to start with a model and scene, circuit editor, table-to-ASCII report, and mood dashboard. Circuit checks help inspect connections; they are not an electrical simulator.</p><a class="text-link" href="#creative-workshop">Meet the creative tools →</a></div></details>
</div></section>
<section class="wrap section" id="listen"><div class="eyebrow">TRY ONE USEFUL CONNECTION</div><h2>Listen to your PDF documents.</h2><p class="intro">Drop in a PDF, connect Document Preview to Text to Speech, and click <strong>Speak it all</strong>. Pick a voice and adjust the reading speed. No Ollama model required.</p><div class="flow" aria-label="PDF read-aloud workflow">FileWorkspace → Document Preview → Text to Speech</div><div class="actions"><a class="button" href="${base}listen-to-pdf-documents/">Follow the read-aloud guide →</a><a class="text-link" href="#download">Download indigoQ ↓</a></div><p class="muted">Uses extracted PDF text and browser speech synthesis. Scanned documents need OCR; voices depend on your browser and operating system.</p></section>
<section class="wrap section" id="examples"><div class="eyebrow">LESS SETUP. MORE EXPLORING.</div><h2>A small workspace for each big idea.</h2><p class="intro">Start from a bundled example, connect the pieces, and make it your own.</p>
<div class="feature-grid"><article class="card"><span class="tag">01 / DATA</span><h3>From rows to insight</h3><p>Edit tables, compare chart series, brush points, and export the results. Keep your data flow visible as it grows.</p><a href="${base}csv-data-visualization/">Explore CSV & chart workflows →</a></article><article class="card"><span class="tag">02 / DOCUMENTS</span><h3>Read. Connect. Compare.</h3><p>Preview PDFs and Markdown, pick different files in separate workspaces, and compare their extracted text.</p><a href="${base}compare-pdf-documents-locally/">Compare two PDFs locally →</a></article><article class="card"><span class="tag">03 / LOCAL AI</span><h3>Give your model a workbench</h3><p>Connect Ollama output to equations, JSON transforms, and tables. Inspect each step and keep control of what runs.</p><a href="${base}local-ai-workflows-ollama/">Build an Ollama workflow →</a></article></div>
<div class="showcase"><img src="${base}images/chart-studio.png" width="1280" height="1200" loading="lazy" alt="Chart Studio plotting weekly sales for North and South regions with chart controls and export tools"><div><div class="eyebrow">CHART STUDIO</div><h2>Your data has a story.<br>Find its shape.</h2><p>Line, scatter, bar, and histogram charts. Multiple series. Selection brushes. Exportable images and data.</p><a class="text-link" href="${base}csv-data-visualization/">Follow the charting guide →</a></div></div>
<div class="showcase reverse"><img src="${base}images/oscillator-lab.png" width="1280" height="1200" loading="lazy" alt="Oscillator Lab with amplitude, frequency, and damping knobs controlling a damped sine wave"><div><div class="eyebrow">OSCILLATOR LAB</div><h2>Make equations<br>feel tangible.</h2><p>Connect a text editor to a live mathematical plot. Turn amplitude, frequency, and damping knobs, then export sampled curves.</p><p>Load <strong>Oscillator Lab</strong> from the Examples menu to try it.</p><a class="text-link" href="${repo}/blob/main/frontend/public/examples/oscillator-lab.json">View the example graph →</a></div></div></section>
<section class="wrap section" id="creative-workshop"><div class="eyebrow">SIX NEW TOOLS. ONE CONNECTED CANVAS.</div><h2>Make room for your next project.</h2><p class="intro">Load <strong>Examples → Creative Workshop</strong> in the app for a prewired circuit editor, model and scene, table-to-art report, mood dashboard, and USB debugging workspace.</p>
<div class="feature-grid">
<article class="card"><span class="tag">CIRCUITS</span><h3>Plan parts and connections</h3><p>Add components, wire pins, check basic power/ground connectivity, and export circuit JSON and planning notes.</p><a href="${base}electronic-workshop-circuits/">Explore Electronic Workshop →</a></article>
<article class="card"><span class="tag">MODELS & SCENES</span><h3>Build once. Place anywhere.</h3><p>Inspect meshes with perspective, solid/wireframe views, and spin. Place instances in World Builder and export scenes with geometry.</p><a href="${base}3d-models-and-worlds/">Compose a 3D scene →</a></article>
<article class="card"><span class="tag">CHARACTER ART</span><h3>Give images a text texture</h3><p>Convert images to ASCII or Braille and numeric tables to sparklines. Publish text to a report or save TXT files.</p><a href="${base}ascii-art-images-to-text/">Create character art →</a></article>
<article class="card"><span class="tag">AMBIENT MOOD</span><h3>Turn a mood into values</h3><p>Ambient Mood derives color, intensity, and tempo from keywords or table statistics. Inspect values in Dashboard or use them in an HTML Playground.</p><a href="${base}ambient-mood-from-text/">Connect mood controls →</a></article>
<article class="card"><span class="tag">USB DEBUG</span><h3>See the bytes behind a device</h3><p>Choose a USB device, claim an interface, read and send hex bytes, and publish the traffic log. Requires WebUSB in Chrome/Edge.</p><a href="${base}usb-debug-devices/">Read the USB guide →</a></article>
<article class="card"><span class="tag">STARTER CANVAS</span><h3>A project ready to explore</h3><p>Sample model and scene data, table art, text-derived controls, and connected Export Files are included. Exports are explicit; device access starts on a click.</p><a href="${repo}/blob/main/frontend/public/examples/creative-workshop.json">View Creative Workshop JSON →</a></article>
</div><p><a href="${repo}/blob/main/docs/WORKSPACES.md">Workspace reference: formats, controls, and exports →</a></p></section>
<section class="band"><div class="wrap section"><div class="eyebrow">A WORKBENCH THAT RUNS WHERE YOU DO</div><h2>Local by default.<br>Flexible by design.</h2><div class="feature-grid compact"><div><h3>Keep your files nearby</h3><p>The app runs on your machine. Uploaded files live beside the graph as binaries, organized by workspace.</p></div><div><h3>Choose when AI runs</h3><p>Ollama is optional and installed separately. Local models run explicitly; HTTP tools can connect to services you choose.</p></div><div><h3>Take your work with you</h3><p>Save a portable JSON export with your graph and files. Load it later or share it with someone else.</p></div></div></div></section>
<section class="wrap section" id="guides"><div class="eyebrow">PICK A FIRST PROJECT</div><h2>A useful workflow in a few steps.</h2><div class="guide-list">${guides.map(guide => `<a href="${base}${guide.slug}/"><span>${escape(guide.category)}</span><h3>${escape(guide.title)}</h3><span aria-hidden="true">↗</span></a>`).join("")}</div></section>
<section class="wrap section download" id="download"><div class="eyebrow">YOUR FIRST PROJECT STARTS HERE</div><h2>Download. Unpack. Connect.</h2><p class="intro">Get the latest free portable release. The bundle includes the frontend, backend, and Python runtime.</p><div class="actions"><a class="button" href="${repo}/releases/latest">Download for macOS, Windows & Linux ↗</a><a class="text-link" href="${repo}/blob/main/docs/INSTALL.md">Installation guide →</a></div><ol class="quick-start"><li>Choose the archive for your operating system and unpack it.</li><li>Launch <strong>Start indigoQ</strong> from the extracted folder.</li><li>Open the local address shown by the launcher, normally <code>http://127.0.0.1:8787</code>.</li><li>Choose the file-menu icon → <strong>Examples → Chart Studio</strong> for a first chart, or <strong>Creative Workshop</strong> for a creative canvas.</li></ol><p class="muted">The website is a guide to the app. Your workspace runs locally after download.</p></section>
<section class="wrap section first-feedback" aria-labelledby="feedback-title"><div class="eyebrow">BUILT BY A PERSON. BETTER WITH YOUR IDEAS.</div><h2 id="feedback-title">Try one workflow.<br>Tell me how it went.</h2><p class="intro">I’m Paul, the developer of indigoQ. I’d love to know what you make with it—and where the experience could be clearer. Start with one example, then tell me what worked or where you got stuck.</p><div class="actions"><a class="button" href="${repo}/issues/new">Share feedback on GitHub →</a><a class="text-link" href="${repo}">Explore the source →</a></div><p class="muted">For a bug report, include your operating system, browser, the workflow you tried, and any error message.</p></section>
<section class="wrap support-section" aria-labelledby="support-title"><div class="support-card"><div><div class="eyebrow">INDEPENDENTLY BUILT. COMMUNITY SUPPORTED.</div><h2 id="support-title">Finding indigoQ useful?</h2><p>I’m Paul, the developer behind indigoQ. If it saves you time or sparks an idea, a donation is a lovely way to support its continued development. Thank you!</p></div><a class="button donate" href="https://paypal.me/pdgadams"><span aria-hidden="true">♡</span> Donate via PayPal ↗</a></div></section>
<section class="wrap section faq"><h2>A few things to know.</h2><details><summary>Is indigoQ free?</summary><p>Yes. The source and portable releases are freely available on GitHub. If it saves you time, you can <a href="https://paypal.me/pdgadams">support development via PayPal</a>.</p></details><details><summary>Do I need Ollama?</summary><p>Only for local AI features. Tables, charts, PDF previews, text comparison, mathematical plots, and the canvas work without it.</p></details><details><summary>Can I compare scanned PDFs?</summary><p>You can preview scanned PDFs. Text comparison requires extractable text; OCR is not currently included.</p></details><details><summary>Where should I send feedback?</summary><p>Please <a href="${repo}/issues">open a GitHub issue</a> with what you tried, your operating system, and any error message. Small, specific examples are especially helpful.</p></details></section>`;
writeFileSync(path.join(output, "index.html"), layout({ title: "indigoQ — Local-first visual workbench for data, AI & creative tools", description: "Connect documents, charts, local AI, circuits, 3D scenes, ASCII art, and ambient controls on an infinite canvas. Free for macOS, Windows, and Linux.", body }));
for (const guide of guides) {
  mkdirSync(path.join(output, guide.slug), { recursive: true });
  const visual = guide.image
    ? `<figure><img src="${base}images/${guide.image}" width="1280" height="1200" alt="${escape(guide.title)}"><figcaption>${escape(guide.relatedName)} example, opened fullscreen.</figcaption></figure>`
    : `<div class="flow" aria-label="Workflow">${escape(guide.flow ?? "FileWorkspace → two Document Previews → Diff / Compare")}</div>`;
  const related = guide.related
    ? `<p>Try the bundled <strong>${escape(guide.relatedName)}</strong> example from the file-menu icon → Examples. <a href="${repo}/blob/main/frontend/public/examples/${guide.related}.json">View its saved graph on GitHub</a>.</p>`
    : `<p><a href="${repo}/blob/main/docs/WORKSPACES.md">Read the workspace reference</a> for formats and setup.</p>`;
  const body = `<article class="wrap article"><a class="breadcrumb" href="${base}">← indigoQ</a><div class="eyebrow">${escape(guide.category)}</div><h1>${escape(guide.title)}</h1><p class="lead">${escape(guide.intro)}</p><p>Before you start, <a href="${base}#download">download and launch indigoQ</a>. The app runs on your own computer.</p>${visual}<ol class="steps">${guide.steps.map(([title, text]) => `<li><h2>${escape(title)}</h2><p>${escape(text)}</p></li>`).join("")}</ol><aside class="note"><h2>Good to know</h2><p>${escape(guide.note)}</p></aside><h2>Keep exploring</h2>${related}<div class="actions"><a class="button" href="${base}#download">Get indigoQ ↓</a><a href="${repo}/issues">Questions or feedback?</a></div><nav class="related" aria-label="More workflow guides">${guides.filter(item => item !== guide).map(item => `<a href="${base}${item.slug}/">${escape(item.title)} →</a>`).join("")}</nav></article>`;
  writeFileSync(path.join(output, guide.slug, "index.html"), layout({ ...guide, body, article: true }));
}
writeFileSync(path.join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", ...guides.map(guide => guide.slug + "/")].map(slug => `<url><loc>${origin}${base}${slug}</loc></url>`).join("")}</urlset>\n`);
writeFileSync(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${origin}${base}sitemap.xml\n`);
writeFileSync(path.join(output, ".nojekyll"), "");
console.log(`Built indigoQ website: ${output} (${guides.length + 1} pages)`);
