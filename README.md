# ICO to PNG

by [Nicholas C. Zakas](https://humanwhocodes.com)

If you find this useful, please consider supporting my work with a [donation](https://humanwhocodes.com/donate).

## Description

A zero-dependency package for converting .ico files to .png format in JavaScript. This package parses ICO file data, extracts embedded images, and converts them to PNG format when necessary.

## Installation

```shell
npm install @humanwhocodes/ico-to-png
```

## Usage

This package exports four main functions:

### `extractImages(icoData)`

Extracts all images from ICO file data.

**Parameters:**

- `icoData` (Uint8Array): The ICO file data

**Returns:** An array of objects, each containing:

- `data` (Uint8Array): The raw image data (BMP or PNG)
- `width` (number): The width of the image
- `height` (number): The height of the image
- `bpp` (number): The bits per pixel
- `type` ("bmp" | "png"): The format of the raw image data

**Example:**

```js
import { extractImages } from "@humanwhocodes/ico-to-png";
import { readFile } from "fs/promises";

const icoData = await readFile("favicon.ico");
const images = extractImages(icoData);

console.log(`Found ${images.length} images`);
images.forEach((image, index) => {
	console.log(
		`Image ${index}: ${image.width}x${image.height}, ${image.bpp}bpp, type: ${image.type}`,
	);
});
```

### `convertToPng(imageData, width, height)`

Converts an image from ICO format to PNG format. If the image is already a PNG, it's returned as-is. If the image is a BMP, it's converted to PNG with proper transparency handling.

**Parameters:**

- `imageData` (Uint8Array): The image data from an ICO file
- `width` (number): The width of the image
- `height` (number): The height of the image

**Returns:** A Uint8Array containing the PNG image data

**Example:**

```js
import { extractImages, convertToPng } from "@humanwhocodes/ico-to-png";
import { readFile, writeFile } from "fs/promises";

const icoData = await readFile("favicon.ico");
const images = extractImages(icoData);

// Convert the first image to PNG
const pngData = convertToPng(images[0].data, images[0].width, images[0].height);

await writeFile("favicon.png", pngData);
```

### `extractLargestImage(icoData)`

Extracts the largest image from ICO file data in its original format (BMP or PNG).

**Parameters:**

- `icoData` (Uint8Array): The ICO file data

**Returns:** An object with the same shape as each entry from `extractImages()`.

### `extractLargestImageAsPng(icoData)`

Extracts the largest image from ICO file data and ensures the returned image data is PNG.

**Parameters:**

- `icoData` (Uint8Array): The ICO file data

**Returns:** An object with the same shape as each entry from `extractImages()`, with `type` set to `"png"`.

### Complete Example

```js
import { extractImages, convertToPng } from "@humanwhocodes/ico-to-png";
import { readFile, writeFile } from "fs/promises";

async function convertIcoToPng(icoPath, pngPath) {
	// Read the ICO file
	const icoData = await readFile(icoPath);

	// Extract all images from the ICO
	const images = extractImages(icoData);

	// Convert the largest image to PNG
	const largestImage = images.reduce((prev, current) => {
		return current.width * current.height > prev.width * prev.height
			? current
			: prev;
	});

	const pngData = convertToPng(
		largestImage.data,
		largestImage.width,
		largestImage.height,
	);

	// Write the PNG file
	await writeFile(pngPath, pngData);
}

await convertIcoToPng("favicon.ico", "favicon.png");
```

## Features

- **Zero dependencies**: All logic is implemented in pure JavaScript using Uint8Arrays
- **Full BMP support**: Handles 1-bit, 4-bit, 8-bit, 24-bit, and 32-bit BMP images
- **Transparency handling**: Correctly processes both alpha channels and AND masks
- **PNG pass-through**: Embedded PNG images are returned as-is for efficiency
- **Multiple images**: Extracts all images from multi-resolution ICO files

## License

Copyright 2026 Nicholas C. Zakas

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
