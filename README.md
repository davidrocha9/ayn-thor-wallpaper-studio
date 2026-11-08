# Thor Wallpaper Studio

Create matching wallpapers for both AYN Thor screens from one image or video. Preview them on your device’s colorway, adjust the framing, and export both screens at native resolution.

**[Open Thor Wallpaper Studio →](https://ayn-thor-wallpaper-studio.pages.dev/)**

Free to use, works on desktop and mobile, and processes your files locally in your browser. No account or uploads needed.

## Screenshots

### Desktop

![Thor Wallpaper Studio on desktop, with a six-item media library, a black Thor preview showing a mountain wallpaper, and framing controls.](docs/screenshots/desktop.png)

<details>
<summary>View the mobile layout</summary>

<p align="center">
  <img src="docs/screenshots/mobile.png" width="320" alt="The mobile editor with an imported wallpaper, a Clear Purple Thor preview, and touch-friendly framing and export controls." />
</p>

</details>

## How to use it

1. **Import media.** Click **Import media** or drop an image or video onto the page. Select a thumbnail to use it across both screens.
2. **Frame your wallpaper.** Set screen alignment in the main tools, alongside colorway, fit, zoom, rotation, and backdrop. You can also drag either screen to pan; on desktop, scroll over a screen to zoom.
3. **Optionally cut the source.** Click the **crop icon on a library item**, move or resize the selection over the original, then click **Apply crop**. This updates the same library item without creating a new image or resetting your wallpaper framing. The original file, crop selection, and aspect-ratio preference stay saved. Reopen cropping to adjust the selection, or choose **Restore original** and apply to remove the crop. **Cancel** discards the selection without changing your wallpaper. The selection follows the Thor aspect ratio by default; unlock it for a free crop.
4. **Export both screens.** Open **Export settings** to choose a format, then click **Export both screens** to download the matching files.
5. **Apply them on your Thor.** Transfer the exported files to your device and set the wallpapers yourself; this tool doesn’t apply them automatically.

| Display | Export resolution |
| --- | --- |
| Top | 1920 × 1080 |
| Bottom | 1240 × 1080 |

### Source size and screen alignment

New workspaces use **Physical** alignment: the two screen regions account for their different pixel densities and skip the image area behind the hinge and bezels. Physical alignment uses a **16 mm** gap by default, the midpoint of an approximate **15–17 mm** owner measurement. Screen proportions are derived from AYN’s advertised 6-inch and 3.92-inch diagonals; alignment is approximate and can vary with viewing angle and launcher scaling.

At the default gap, **about 1920 × 2257** is a useful source shape. Larger sources with the same aspect ratio provide more detail, and other dimensions work too: Cover crops the excess, while Contain keeps the full source with a backdrop. Cropping is reversible for images, videos, and animated GIFs: a saved source selection is applied to previews and exported frames while the original stays intact. Applying a crop does not encode a new source file or use another library slot.

Cover, Contain, and Stretch are available in either alignment. Switching alignment preserves your selected fit; Stretch fills the scene by distorting the source.

**Continuous** alignment retains the original **1920 × 2160** split without gap or pixel-density compensation. Existing saved workspaces keep this mode until you explicitly switch them. Setting the gap to zero in Physical mode does not reproduce Continuous mode.

Images export as **PNG, JPEG, or WebP**. Videos can export as a still frame or a **2–15 second clip** at 30 or 60 fps. Clip support and format depend on your browser; Chrome or Edge is recommended. Keep the tab visible while recording a clip.

The library holds up to **24 files**, with **six per page**. Both screens always share one wallpaper and the same framing adjustments.

## Privacy and saved files

Your images and videos stay in your browser and aren’t uploaded to a server. The library, selected wallpaper, and settings are saved locally so you can return to them later.

Saved files are specific to your browser and site address. Clearing site data removes them, and private browsing or storage limits may prevent saving. **Remove** and **Clear library** also delete the corresponding saved files.

## Run locally

Use **Node.js 24** and npm:

```bash
git clone https://github.com/davidrocha9/ayn-thor-wallpaper-studio.git
cd ayn-thor-wallpaper-studio
npm ci
npm run dev
```

Open the local URL printed by Vite, usually <http://localhost:5173>.

### Development commands

```bash
npm run build                # Type-check and build into dist/
npm run preview              # Preview the production build
npm run lint                 # Run Oxlint
node --test tests/*.test.mjs  # Run unit tests
```

Built with React, TypeScript, Vite, Tailwind CSS, and shadcn/ui.

<details>
<summary>Optional browser tests</summary>

With a local server running and Playwright installed:

```bash
node --test tests/*.browser.mjs
```

The suites check responsive layouts, touch interactions, library pagination, favicons, crop controls, saved-workspace compatibility, and the actual pixels and dimensions of image and video exports. Set `BASE_URL` to test a different server (default: `http://127.0.0.1:5173`). If Playwright is installed outside the project, set `PLAYWRIGHT_MODULE` to its `index.mjs` path.

</details>
