import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "public/betspot.svg"), "utf8");

const header =
  '<svg width="84" height="68" viewBox="0 0 84 68" fill="none" xmlns="http://www.w3.org/2000/svg">';

const frameRect = src.match(/<rect x="0\.5"[^/]+\/>/)[0];
const overlayBody = src
  .match(/<g filter="url\(#filter0_i[\s\S]*<\/g>\n<defs>/)[0]
  .replace(/\n<defs>$/, "");

const defsBlock = src.match(/<defs>[\s\S]*<\/defs>/)[0];
const linearGrads = [
  ...defsBlock.matchAll(/<linearGradient[\s\S]*?<\/linearGradient>/g),
].map((m) => m[0]);
const radialGrads = [
  ...defsBlock.matchAll(/<radialGradient[\s\S]*?<\/radialGradient>/g),
].map((m) => m[0]);
const filters = [...defsBlock.matchAll(/<filter[\s\S]*?<\/filter>/g)].map((m) => m[0]);

const frameDefs = `<defs>\n${linearGrads.join("\n")}\n</defs>`;
const overlayDefs = `<defs>\n${filters.join("\n")}\n${radialGrads.join("\n")}\n</defs>`;

const frame = `${header}\n${frameRect}\n${frameDefs}\n</svg>\n`;
const overlay = `${header}\n${overlayBody}\n${overlayDefs}\n</svg>\n`;

fs.writeFileSync(path.join(root, "public/betspot-frame.svg"), frame);
fs.writeFileSync(path.join(root, "public/betspot-overlay.svg"), overlay);
console.log("Wrote betspot-frame.svg", frame.length, "bytes");
console.log("Wrote betspot-overlay.svg", overlay.length, "bytes");
