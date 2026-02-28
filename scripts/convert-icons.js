/**
 * Script to convert all .ico files in the fixtures directory to PNG files.
 */

import { readFile, writeFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractImages } from "../src/index.js";

const FIXTURES_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"tests",
	"fixtures",
);

const entries = await readdir(FIXTURES_DIR);
const ICO_FILES = entries.filter(f => /\.ico$/i.test(f));

for (const icoFile of ICO_FILES) {
	const icoPath = join(FIXTURES_DIR, icoFile);
	const baseName = icoFile.replace(/\.ico$/i, "");

	const icoData = await readFile(icoPath);
	const images = extractImages(new Uint8Array(icoData));

	console.log(`${icoFile}: found ${images.length} image(s)`);

	for (let i = 0; i < images.length; i++) {
		const image = images[i];
		const suffix =
			images.length > 1 ? `-${image.width}x${image.height}` : "";
		const outPath = join(
			FIXTURES_DIR,
			`${baseName}${suffix}.${image.type}`,
		);
		await writeFile(outPath, image.data);
		console.log(
			`  -> ${outPath} (${image.width}x${image.height}, ${image.bpp}bpp)`,
		);
	}
}
