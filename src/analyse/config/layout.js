/** Stage geometry (178×106 design space) and render sizing. */

export const SUPERSAMPLE = 4;

export const STAGE = {
  width: 178,
  height: 106,
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
  chip: "/analyse/chip.png",
  reference: "/analyse/reference.png",
  // Traced neural reference — source of the inner path network.
  neural: "/analyse/neural-reference.jpg",
};

/** CSS display scale (design px → screen px). Canvas uses SUPERSAMPLE internally. */
export const DEFAULT_SIZE_SCALE = 1;
