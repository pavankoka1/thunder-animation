# Thunder Animation

Canvas practice for betspot plasma / thunder effects.

**Current step:** static SVG → Canvas at highest quality. No animation.

## Assets

| File                 | What it is                                                |
| -------------------- | --------------------------------------------------------- |
| `public/betspot.svg` | Vector UI — gradients, paths, filters (84×68)             |
| `public/plasma.svg`  | Embedded 1364×1153 PNG in `<pattern>`, screen blend @ 60% |

## Run

```bash
npm install
npm run dev
```

Left column: native SVG. Right column: same assets rasterized on Canvas (`drawImage` at 4× + `devicePixelRatio`).

## Canvas vs WebGL

- **Static match:** Canvas is sufficient. Browser rasterizes SVG filters/gradients correctly.
- **plasma.svg** is a baked texture, not vector paths — procedural animation needs WebGL (Voronoi / fBM noise shaders), not more Canvas paths.

## Format

```bash
npm run format
```
