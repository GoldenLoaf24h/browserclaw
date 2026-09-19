# Visual Fallback & Multimodal Coordination Reference (PCIE)

This reference documents the secondary visual execution engine for canvas games, WebGL visualizations, unlabeled SVG icons, or anti-bot DOM-obfuscated layouts.

---

## 1. When to Use Visual Fallback

- **Canvas & WebGL**: Interactive games, maps, charts, or drawing apps without DOM elements.
- **Unlabeled SVG Elements**: Graphical buttons or custom icons lacking text, aria-labels, or roles.
- **DOM Obfuscation**: Elements deliberately detached or hidden from accessibility trees.
- **Visual Verification**: Checking visual styling, alignment, or screenshot-based evidence.

_Rule: Never use visual fallback when a numeric index from `chrome_read_dom` is available. DOM interaction is 10x faster and 100% deterministic._

---

## 2. DPR 1:1 Viewport Normalization (Zero Coordinate Drift)

BrowserClaw automatically resamples all screenshots using `OffscreenCanvas` to exact CSS viewport dimensions ($W_{img} \equiv W_{viewport}, H_{img} \equiv H_{viewport}$):

- Completely eliminates coordinate drift caused by Windows display scaling (125%, 150%, 200%) or Retina displays.
- Every coordinate label `(x, y)` visible on the screenshot maps 1:1 with mathematical fidelity to CDP physical pointer events and `getBoundingClientRect()`.

---

## 3. Visual Perception Tools

### A. Calibrated Coordinate Grid & Perimeter Rulers

```json
{
  "grid": true,
  "showRuler": true,
  "format": "jpeg",
  "quality": 80
}
```

- Overlays semi-transparent 100px grid rulers directly on the viewport.
- Perimeter rulers mark exact CSS pixel ticks along the top and left borders.

### B. Set-of-Mark 2.0 (SoM)

```json
{
  "som": true,
  "somOptions": {
    "filterVisibleOnly": true,
    "maxElements": 60,
    "collisionAvoidance": true
  }
}
```

- Labels interactive elements with high-contrast, compact numeric badges.
- Incorporates frustum culling (pruning off-screen nodes) and 25px collision avoidance.

### C. Industrial Full-Page Capture (`fullPage: true`)

```json
{
  "fullPage": true,
  "format": "png"
}
```

- Emulates GoFullPage: stitches viewports sequentially, restores original scroll offset, hides fixed-position headers to prevent ghost duplication, and handles sticky elements cleanly.

### D. Lossless ROI Sub-Region Crops & Zoom

```json
{
  "clip": { "x": 300, "y": 200, "width": 400, "height": 300 },
  "zoom": 2.0
}
```

- Captures zoomed sub-regions at native device fidelity for tiny captchas, small icons, or dense data tables.

---

## 4. Multimodal Coordinate Actions (`chrome_computer`)

For visual clicks and typing, BrowserClaw supports Polymorphic Coordinate Input (PCIE):

- **Object Format**: `{ "action": "left_click", "coordinate": { "x": 450, "y": 320 } }`
- **Array Format**: `{ "action": "left_click", "coordinate": [450, 320] }`
- **Supported Actions**: `left_click`, `right_click`, `double_click`, `triple_click`, `middle_click`, `mouse_down`, `mouse_up`, `mouse_move`, `type`, `key`, `drag`, `scroll`.
- **Pre-flight Occlusion Inspection**: Automatically runs `DOM.getNodeForLocation` / `DOM.getBoxModel` to prevent clicking obscured elements.
- **Natural Kinematics**: Enforces humanized deceleration trajectories within a 65px radius, 80-120ms physiological settling pauses, and supports hold durations up to 3000ms.
