# Creative workspace reference

Load **Examples → Creative Workshop** for a ready-wired canvas with the six new
tools, a sample model and scene, table-to-art workflow, mood controls, and an
Export Files workspace. Each tool is also available from the workspace picker.

## Quick workflow map

| Start with | Connect to | Result |
| --- | --- | --- |
| FileWorkspace images or Data Table | ASCII Art → Document Preview | Published character art and TXT files |
| TextEditor or table data | Ambient Mood → Dashboard / HTML Playground | Named mood controls |
| Circuit parts or imported circuit JSON | Electronic Workshop → FileWorkspace | Circuit JSON or text planning notes |
| Sample meshes or model JSON | 3D Modeler → World Builder → FileWorkspace | Reusable models and self-contained scenes |
| Browser-approved USB device | USB Debug → Document Preview / Ollama | Published traffic log |

Edits to circuits, model geometry, scene instances, and tool settings are saved
with the graph. Export/publish actions create explicit downstream snapshots and
save files into outgoing connected FileWorkspaces.

Use the header's **Save JSON** for the complete canvas, including connections,
drafts, settings, and files. Tool-specific exports save only the selected design
or published result. **Load JSON** in the header replaces the canvas; import/drop
actions inside a workspace affect that tool instead.

## ASCII Art

Connect **FileWorkspace → ASCII Art** for images or **Data Table / Math Lab →
ASCII Art** for numeric sparklines. Auto mode chooses images when available;
the input-mode selector can choose a mode explicitly.

For images, select the connected file (the first is used by default), choose
ASCII or Braille, and adjust contrast, brightness, inversion, columns, and font
size. The canvas shows the image; the adjacent preview shows character art.
Transparent pixels are composited on white for conversion.

**Publish TXT** works in both image and table modes. It publishes plain text and
a TXT file, and saves that file into outgoing FileWorkspaces. **Download TXT**
downloads the current preview. Connect **ASCII Art → Document Preview** to display
the published art. Art represents shapes; it is not a natural-language image
description.

## Ambient Mood

Connect text or a table source. Document Preview, TextEditor, and Ollama text
take priority; otherwise the first connected table supplies numeric statistics.
Text analysis uses emotional keywords and punctuation, rather than an LLM.

| Control | Value |
| --- | --- |
| `moodColor` | Hex color |
| `intensity` | Number, 0–100 |
| `tempo` | Number, 20–220 |
| `brightness` | Number, 0–100 |
| `saturation` | Number, 0–100 |
| `active` | Boolean |

Values publish live in the current page and are saved as an output snapshot.
Calm/sad keywords use lower base tempo and intensity than energetic keywords.
Use **Dashboard** to inspect values, or **HTML Playground** to read these exact
names from `event.detail.controls` on an `indigoq:input` event. Other tools react
only to matching parameter names; `tempo` does not automatically set Audio Lab's
`frequency`.

Moving a control switches to manual mode. Enable **Auto mood** to resume derived
values. **Configure controls (JSON)** accepts the same definitions as Shared
Controls. Automatic analysis preserves definitions and updates recognized names;
custom names retain their values.

## USB Debug

Requires a WebUSB-capable Chrome/Edge browser on localhost or HTTPS. Click
**Connect USB Device** and approve a device through the browser chooser.
The first device configuration is selected when none is active.

1. **Explore Interfaces** lists interfaces and alternate settings from the active
   configuration. Bulk and interrupt endpoints are supported.
2. Select an interface/alternate to claim it, then choose an IN and/or OUT endpoint.
3. **Read Once** requests 64 bytes; **Start Read** queues continuous reads.
4. **Stop Read** prevents further reads. An in-flight transfer may finish when
   data arrives; **Disconnect** closes the device.
5. Enter complete hexadecimal byte pairs, such as `DE AD BE EF`, and click **Send**.

The log keeps up to 200 timestamped entries and publishes its text to downstream
consumers. **Clear Log** clears the published output too. Graph loading does not
reconnect hardware or start reads. Removing the workspace closes its device.
On Windows, claiming an interface may require a WinUSB or libusbK driver.

## Electronic Workshop

Add Power, MCU, LED, Resistor, Button, LCD, Ground, or Wire components. The
workspace's Examples selector includes **Blink LED** and **LCD Controller**.

- Drag parts to move them; select one to edit its label/value, rotate, or delete.
- Click two pins to connect. **Cancel wire** abandons the pending connection.
- Double-click a wire to remove it. Deleting a part removes its wires.
- **Test circuit** checks MCU/LCD power and ground connections and direct
  source-to-ground shorts, including connections through shared nets.
- **Save design ↓** publishes and downloads circuit JSON.
- **Manufacturing package ↓** publishes and downloads a text planning document
  with BOM, netlist, placement notes, and assembly guidance.
- **Ask AI** prepares a prompt to copy into Ollama; generation remains explicit.
- Drop circuit JSON, use **Apply JSON**, or import a connected text source.

The loader initializes template pins and accepts legacy `vsource` components and
numeric pin references. Unsupported types and dangling wires produce an error.
Checks are connectivity heuristics, not an electrical simulation. The planning
package is text, not fabrication-ready RS-274X Gerber or drill files.

## 3D Modeler

Add Cube, Pyramid, Spaceship, or Car meshes, or drop a JSON model. Edit mesh names
and colors, or use the JSON panel to edit vertices/faces. Names identify meshes
in World Builder. The loader accepts object-form or legacy array-form vertices.

```json
{
  "version": 1,
  "name": "Triangle model",
  "meshes": [{
    "name": "Triangle",
    "vertices": [
      { "x": -1, "y": -1, "z": 0 },
      { "x": 1, "y": -1, "z": 0 },
      { "x": 0, "y": 1, "z": 0 }
    ],
    "faces": [[0, 1, 2]],
    "color": "#3b82f6"
  }]
}
```

Faces contain at least three valid zero-based vertex indices. Limits are 100
meshes, 10,000 vertices and 20,000 faces per mesh.

The perspective viewer supports wireframe/solid mode, back-face culling, and
explicit **Spin / Stop Spin**. View controls cover translation `tx/ty/tz`, rotation
`rx/ry/rz` in degrees, and scale `sx/sy/sz`; connected controls override matching
local values. They change the preview, not exported mesh coordinates.

**Export model ↓** publishes reusable geometry JSON, downloads it, and saves it
into outgoing FileWorkspaces. Import connected model/AI text explicitly through
the JSON panel. Spin never starts on graph load.

## World Builder

Connect **3D Modeler → World Builder** and export the model. The asset list
refreshes with connected model snapshots. You can also drop model JSON files.

Use **Place mesh-name** to add instances. Edit position, rotation, and scale on
all three axes; toggle visibility or delete instances. Connected transform
controls provide scene-wide offsets/scale in the preview.

**Export world ↓** includes both instances and mesh geometry, publishes JSON,
downloads it, and saves into outgoing FileWorkspaces. A scene can therefore be
imported independently. Missing referenced models are reported before export.
Dropping world JSON replaces the local scene; dropping model JSON adds/replaces
named assets.

```json
{
  "version": 1,
  "name": "Scene",
  "meshes": [],
  "instances": [{
    "id": "triangle-1", "modelName": "Triangle",
    "tx": 0, "ty": 0, "tz": 0,
    "rx": 0, "ry": 0, "rz": 0,
    "sx": 1, "sy": 1, "sz": 1,
    "visible": true
  }]
}
```

Populate `meshes` with the model format above, or supply a connected model source.
Legacy scene files without geometry remain supported. Scene limit: 1,000 instances.

## Related documentation

- [README: workspaces and persistence](../README.md#live-controls-and-saved-outputs)
- [Installation and releases](INSTALL.md)
- [Public website maintenance](../site/README.md)
