/**
 * Layer layout — measured directly from the HD Figma "Regular Betspot v2"
 * export (reference.png, 712×424 → ÷4 = 178×106 working space) by isolating
 * each layer's colour signature (body cyan pattern, dark pill, chip fill)
 * and locating it in the composite.
 */

export const STAGE = {
  width: 178,
  height: 106,
  /** On-screen upscale — keeps PNG layers crisp. */
  scale: 3,
};

export const BODY = {
  x: 16,
  y: 16,
  width: 146,
  height: 68,
  cornerRadius: 10,
};

export const TOP_BAR = {
  x: 58,
  y: 20,
  width: 62,
  height: 14,
};

export const CHIP = {
  x: 115,
  y: 37,
  width: 42,
  height: 42,
};

export const LAYER_URLS = {
  body: "/analyse/body.png",
  topBar: "/analyse/top-bar.png",
  chip: "/analyse/chip.png",
  reference: "/analyse/reference.png",
};

/** Screen-blended over the body — only paths add light, gaps stay blue. */
export const ENERGY_OPACITY = 1;

/** Formation timing — matches the existing betspot-activation choreography. */
export const FORMATION_MS = 1500;
export const BORDER_RAMP_MS = 260;
