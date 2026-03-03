/**
 * @fileoverview Tests for the ICO to PNG converter.
 * @author Nicholas C. Zakas
 */

//-----------------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------------

import {
	extractImages,
  extractImagesAsPng,
	extractLargestImage,
	extractLargestImageAsPng,
	convertToPng,
} from "../src/index.js";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

/**
 * Creates a simple ICO file with a single 16x16 32-bit BMP image.
 * @returns {Uint8Array} The ICO file data.
 */
function createSimple32BitICO() {
	const width = 16;
	const height = 16;
	const bpp = 32;

	// BMP header (BITMAPINFOHEADER)
	const bmpHeaderSize = 40;
	const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
	const xorSize = rowSize * height;
	const andRowSize = Math.floor((width + 31) / 32) * 4;
	const andSize = andRowSize * height;
	const bmpSize = bmpHeaderSize + xorSize + andSize;

	// Create BMP data
	const bmpData = new Uint8Array(bmpSize);

	// BITMAPINFOHEADER
	writeUInt32LE(bmpData, 0, bmpHeaderSize); // biSize
	writeUInt32LE(bmpData, 4, width); // biWidth
	writeUInt32LE(bmpData, 8, height * 2); // biHeight (double for ICO)
	writeUInt16LE(bmpData, 12, 1); // biPlanes
	writeUInt16LE(bmpData, 14, bpp); // biBitCount
	writeUInt32LE(bmpData, 16, 0); // biCompression (BI_RGB)
	writeUInt32LE(bmpData, 20, xorSize + andSize); // biSizeImage
	writeUInt32LE(bmpData, 24, 0); // biXPelsPerMeter
	writeUInt32LE(bmpData, 28, 0); // biYPelsPerMeter
	writeUInt32LE(bmpData, 32, 0); // biClrUsed
	writeUInt32LE(bmpData, 36, 0); // biClrImportant

	// Fill XOR mask with a gradient (BGRA format, bottom-to-top)
	for (let y = 0; y < height; y++) {
		const rowOffset = bmpHeaderSize + y * rowSize;
		for (let x = 0; x < width; x++) {
			const pixelOffset = rowOffset + x * 4;
			bmpData[pixelOffset] = (x * 16) & 0xff; // B
			bmpData[pixelOffset + 1] = (y * 16) & 0xff; // G
			bmpData[pixelOffset + 2] = 128; // R
			bmpData[pixelOffset + 3] = 255; // A
		}
	}

	// Fill AND mask (all pixels opaque)
	const andOffset = bmpHeaderSize + xorSize;
	for (let i = 0; i < andSize; i++) {
		bmpData[andOffset + i] = 0;
	}

	// Create ICO file
	const icoSize = 6 + 16 + bmpSize; // header + directory entry + image
	const icoData = new Uint8Array(icoSize);

	// ICO header
	writeUInt16LE(icoData, 0, 0); // reserved
	writeUInt16LE(icoData, 2, 1); // type (1 = ICO)
	writeUInt16LE(icoData, 4, 1); // count

	// Directory entry
	icoData[6] = width; // width
	icoData[7] = height; // height
	icoData[8] = 0; // color count (0 for >8bpp)
	icoData[9] = 0; // reserved
	writeUInt16LE(icoData, 10, 1); // color planes
	writeUInt16LE(icoData, 12, bpp); // bits per pixel
	writeUInt32LE(icoData, 14, bmpSize); // image size
	writeUInt32LE(icoData, 18, 22); // image offset

	// Copy BMP data
	icoData.set(bmpData, 22);

	return icoData;
}

/**
 * Creates a simple ICO file with a transparent pixel.
 * @returns {Uint8Array} The ICO file data.
 */
function createTransparentICO() {
	const width = 16;
	const height = 16;
	const bpp = 32;

	const bmpHeaderSize = 40;
	const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
	const xorSize = rowSize * height;
	const andRowSize = Math.floor((width + 31) / 32) * 4;
	const andSize = andRowSize * height;
	const bmpSize = bmpHeaderSize + xorSize + andSize;

	const bmpData = new Uint8Array(bmpSize);

	// BITMAPINFOHEADER
	writeUInt32LE(bmpData, 0, bmpHeaderSize);
	writeUInt32LE(bmpData, 4, width);
	writeUInt32LE(bmpData, 8, height * 2);
	writeUInt16LE(bmpData, 12, 1);
	writeUInt16LE(bmpData, 14, bpp);
	writeUInt32LE(bmpData, 16, 0);

	// Fill XOR mask with red, but with varying alpha
	for (let y = 0; y < height; y++) {
		const rowOffset = bmpHeaderSize + y * rowSize;
		for (let x = 0; x < width; x++) {
			const pixelOffset = rowOffset + x * 4;
			bmpData[pixelOffset] = 0; // B
			bmpData[pixelOffset + 1] = 0; // G
			bmpData[pixelOffset + 2] = 255; // R
			// Make corner pixels transparent
			if ((x < 4 && y < 4) || (x >= 12 && y >= 12)) {
				bmpData[pixelOffset + 3] = 0; // A (transparent)
			} else {
				bmpData[pixelOffset + 3] = 255; // A (opaque)
			}
		}
	}

	// Fill AND mask - set corners to transparent
	const andOffset = bmpHeaderSize + xorSize;
	for (let y = 0; y < height; y++) {
		const rowOffset = andOffset + y * andRowSize;
		for (let x = 0; x < width; x++) {
			const byteOffset = rowOffset + Math.floor(x / 8);
			const bitOffset = 7 - (x % 8);
			if ((x < 4 && y < 4) || (x >= 12 && y >= 12)) {
				bmpData[byteOffset] |= 1 << bitOffset;
			}
		}
	}

	// Create ICO file
	const icoSize = 6 + 16 + bmpSize;
	const icoData = new Uint8Array(icoSize);

	writeUInt16LE(icoData, 0, 0);
	writeUInt16LE(icoData, 2, 1);
	writeUInt16LE(icoData, 4, 1);
	icoData[6] = width;
	icoData[7] = height;
	icoData[8] = 0;
	icoData[9] = 0;
	writeUInt16LE(icoData, 10, 1);
	writeUInt16LE(icoData, 12, bpp);
	writeUInt32LE(icoData, 14, bmpSize);
	writeUInt32LE(icoData, 18, 22);
	icoData.set(bmpData, 22);

	return icoData;
}

/**
 * Creates an ICO file with an embedded PNG.
 * @returns {Uint8Array} The ICO file data.
 */
function createPngICO() {
	// Create a minimal 16x16 PNG
	const width = 16;
	const height = 16;

	// PNG signature
	const signature = new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);

	// IHDR chunk
	const ihdrData = new Uint8Array(13);
	writeUInt32BE(ihdrData, 0, width);
	writeUInt32BE(ihdrData, 4, height);
	ihdrData[8] = 8; // bit depth
	ihdrData[9] = 6; // color type (RGBA)
	ihdrData[10] = 0; // compression
	ihdrData[11] = 0; // filter
	ihdrData[12] = 0; // interlace

	const ihdrChunk = createPNGChunk(
		new Uint8Array([73, 72, 68, 82]),
		ihdrData,
	);

	// Simple IDAT chunk with blue pixels
	const pixelData = new Uint8Array(height * (1 + width * 4));
	for (let y = 0; y < height; y++) {
		pixelData[y * (1 + width * 4)] = 0; // filter type
		for (let x = 0; x < width; x++) {
			const offset = y * (1 + width * 4) + 1 + x * 4;
			pixelData[offset] = 0; // R
			pixelData[offset + 1] = 0; // G
			pixelData[offset + 2] = 255; // B
			pixelData[offset + 3] = 255; // A
		}
	}

	const compressedData = simpleDeflate(pixelData);
	const idatChunk = createPNGChunk(
		new Uint8Array([73, 68, 65, 84]),
		compressedData,
	);

	// IEND chunk
	const iendChunk = createPNGChunk(
		new Uint8Array([73, 69, 78, 68]),
		new Uint8Array(0),
	);

	// Build PNG
	const pngSize =
		signature.length +
		ihdrChunk.length +
		idatChunk.length +
		iendChunk.length;
	const pngData = new Uint8Array(pngSize);
	let offset = 0;
	pngData.set(signature, offset);
	offset += signature.length;
	pngData.set(ihdrChunk, offset);
	offset += ihdrChunk.length;
	pngData.set(idatChunk, offset);
	offset += idatChunk.length;
	pngData.set(iendChunk, offset);

	// Create ICO file with embedded PNG
	const icoSize = 6 + 16 + pngSize;
	const icoData = new Uint8Array(icoSize);

	writeUInt16LE(icoData, 0, 0);
	writeUInt16LE(icoData, 2, 1);
	writeUInt16LE(icoData, 4, 1);
	icoData[6] = width;
	icoData[7] = height;
	icoData[8] = 0;
	icoData[9] = 0;
	writeUInt16LE(icoData, 10, 1);
	writeUInt16LE(icoData, 12, 32);
	writeUInt32LE(icoData, 14, pngSize);
	writeUInt32LE(icoData, 18, 22);
	icoData.set(pngData, 22);

	return icoData;
}

/**
 * Creates an ICO file with multiple images.
 * @returns {Uint8Array} The ICO file data.
 */
function createMultiImageICO() {
	const images = [];

	// Create two simple 16x16 and 32x32 BMPs
	for (const size of [16, 32]) {
		const width = size;
		const height = size;
		const bpp = 32;

		const bmpHeaderSize = 40;
		const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
		const xorSize = rowSize * height;
		const andRowSize = Math.floor((width + 31) / 32) * 4;
		const andSize = andRowSize * height;
		const bmpSize = bmpHeaderSize + xorSize + andSize;

		const bmpData = new Uint8Array(bmpSize);

		writeUInt32LE(bmpData, 0, bmpHeaderSize);
		writeUInt32LE(bmpData, 4, width);
		writeUInt32LE(bmpData, 8, height * 2);
		writeUInt16LE(bmpData, 12, 1);
		writeUInt16LE(bmpData, 14, bpp);
		writeUInt32LE(bmpData, 16, 0);

		// Fill with a color based on size
		for (let y = 0; y < height; y++) {
			const rowOffset = bmpHeaderSize + y * rowSize;
			for (let x = 0; x < width; x++) {
				const pixelOffset = rowOffset + x * 4;
				bmpData[pixelOffset] = size === 16 ? 255 : 0; // B
				bmpData[pixelOffset + 1] = size === 16 ? 0 : 255; // G
				bmpData[pixelOffset + 2] = 0; // R
				bmpData[pixelOffset + 3] = 255; // A
			}
		}

		images.push({ width, height, bpp, data: bmpData });
	}

	// Calculate total ICO size
	const numImages = images.length;
	const headerSize = 6;
	const directorySize = numImages * 16;
	let totalSize = headerSize + directorySize;

	for (const img of images) {
		totalSize += img.data.length;
	}

	const icoData = new Uint8Array(totalSize);

	// ICO header
	writeUInt16LE(icoData, 0, 0);
	writeUInt16LE(icoData, 2, 1);
	writeUInt16LE(icoData, 4, numImages);

	// Directory entries
	let imageOffset = headerSize + directorySize;

	for (let i = 0; i < numImages; i++) {
		const img = images[i];
		const entryOffset = headerSize + i * 16;

		icoData[entryOffset] = img.width;
		icoData[entryOffset + 1] = img.height;
		icoData[entryOffset + 2] = 0;
		icoData[entryOffset + 3] = 0;
		writeUInt16LE(icoData, entryOffset + 4, 1);
		writeUInt16LE(icoData, entryOffset + 6, img.bpp);
		writeUInt32LE(icoData, entryOffset + 8, img.data.length);
		writeUInt32LE(icoData, entryOffset + 12, imageOffset);

		icoData.set(img.data, imageOffset);
		imageOffset += img.data.length;
	}

	return icoData;
}

// Helper functions
function writeUInt16LE(data, offset, value) {
	data[offset] = value & 0xff;
	data[offset + 1] = (value >> 8) & 0xff;
}

function writeUInt32LE(data, offset, value) {
	data[offset] = value & 0xff;
	data[offset + 1] = (value >> 8) & 0xff;
	data[offset + 2] = (value >> 16) & 0xff;
	data[offset + 3] = (value >> 24) & 0xff;
}

function writeUInt32BE(data, offset, value) {
	data[offset] = (value >>> 24) & 0xff;
	data[offset + 1] = (value >>> 16) & 0xff;
	data[offset + 2] = (value >>> 8) & 0xff;
	data[offset + 3] = value & 0xff;
}

function createPNGChunk(type, data) {
	const chunk = new Uint8Array(12 + data.length);
	writeUInt32BE(chunk, 0, data.length);
	chunk.set(type, 4);
	chunk.set(data, 8);

	const crcData = new Uint8Array(4 + data.length);
	crcData.set(type, 0);
	crcData.set(data, 4);
	const crc = crc32(crcData);
	writeUInt32BE(chunk, 8 + data.length, crc);

	return chunk;
}

function crc32(data) {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i];
		for (let j = 0; j < 8; j++) {
			crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data) {
	let a = 1;
	let b = 0;
	const MOD_ADLER = 65521;
	for (let i = 0; i < data.length; i++) {
		a = (a + data[i]) % MOD_ADLER;
		b = (b + a) % MOD_ADLER;
	}
	return (b << 16) | a;
}

function simpleDeflate(data) {
	const maxBlockSize = 65535;
	const numBlocks = Math.ceil(data.length / maxBlockSize);
	let compressedSize = 2; // zlib header

	for (let i = 0; i < numBlocks; i++) {
		const blockSize = Math.min(
			maxBlockSize,
			data.length - i * maxBlockSize,
		);
		compressedSize += 5 + blockSize;
	}

	const compressed = new Uint8Array(compressedSize + 4); // +4 for adler32

	compressed[0] = 0x78;
	compressed[1] = 0x01;

	let offset = 2;

	for (let i = 0; i < numBlocks; i++) {
		const blockStart = i * maxBlockSize;
		const blockSize = Math.min(maxBlockSize, data.length - blockStart);
		const isFinal = i === numBlocks - 1 ? 1 : 0;

		compressed[offset] = isFinal;
		compressed[offset + 1] = blockSize & 0xff;
		compressed[offset + 2] = (blockSize >> 8) & 0xff;
		compressed[offset + 3] = ~blockSize & 0xff;
		compressed[offset + 4] = (~blockSize >> 8) & 0xff;

		compressed.set(
			data.slice(blockStart, blockStart + blockSize),
			offset + 5,
		);
		offset += 5 + blockSize;
	}

	const adler = adler32(data);
	compressed[offset] = (adler >> 24) & 0xff;
	compressed[offset + 1] = (adler >> 16) & 0xff;
	compressed[offset + 2] = (adler >> 8) & 0xff;
	compressed[offset + 3] = adler & 0xff;

	return compressed;
}

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("extractImages()", () => {
	it("should throw TypeError for non-Uint8Array input", () => {
		assert.throws(
			() => {
				extractImages("not a uint8array");
			},
			{
				name: "TypeError",
				message: "Expected a Uint8Array argument.",
			},
		);
	});

	it("should throw Error for too small data", () => {
		assert.throws(
			() => {
				extractImages(new Uint8Array(5));
			},
			{
				name: "Error",
				message: "Invalid ICO file: too small.",
			},
		);
	});

	it("should throw Error for invalid header", () => {
		const data = new Uint8Array(6);
		data[0] = 1; // invalid reserved field
		assert.throws(
			() => {
				extractImages(data);
			},
			{
				name: "Error",
				message: "Invalid ICO file: bad header.",
			},
		);
	});

	it("should throw Error for zero images", () => {
		const data = new Uint8Array(6);
		writeUInt16LE(data, 0, 0); // reserved
		writeUInt16LE(data, 2, 1); // type
		writeUInt16LE(data, 4, 0); // count = 0
		assert.throws(
			() => {
				extractImages(data);
			},
			{
				name: "Error",
				message: "Invalid ICO file: no images.",
			},
		);
	});

	it("should extract a single 32-bit BMP image", () => {
		const icoData = createSimple32BitICO();
		const images = extractImages(icoData);

		assert.strictEqual(images.length, 1);
		assert.strictEqual(images[0].width, 16);
		assert.strictEqual(images[0].height, 16);
		assert.strictEqual(images[0].bpp, 32);
		assert.strictEqual(images[0].type, "bmp");
		assert.ok(images[0].data instanceof Uint8Array);
		assert.ok(images[0].data.length > 0);
	});

	it("should extract multiple images", () => {
		const icoData = createMultiImageICO();
		const images = extractImages(icoData);

		assert.strictEqual(images.length, 2);
		assert.strictEqual(images[0].width, 16);
		assert.strictEqual(images[0].height, 16);
		assert.strictEqual(images[1].width, 32);
		assert.strictEqual(images[1].height, 32);
	});

	it("should extract PNG image from ICO", () => {
		const icoData = createPngICO();
		const images = extractImages(icoData);

		assert.strictEqual(images.length, 1);
		assert.strictEqual(images[0].width, 16);
		assert.strictEqual(images[0].height, 16);
		assert.strictEqual(images[0].type, "png");
		// Check PNG signature
		assert.strictEqual(images[0].data[0], 0x89);
		assert.strictEqual(images[0].data[1], 0x50);
		assert.strictEqual(images[0].data[2], 0x4e);
		assert.strictEqual(images[0].data[3], 0x47);
	});
});

describe("convertToPng()", () => {
	it("should throw TypeError for non-Uint8Array input", () => {
		assert.throws(
			() => {
				convertToPng("not a uint8array", 16, 16);
			},
			{
				name: "TypeError",
				message: "Expected a Uint8Array argument.",
			},
		);
	});

	it("should throw TypeError for invalid width", () => {
		assert.throws(
			() => {
				convertToPng(new Uint8Array(10), "not a number", 16);
			},
			{
				name: "TypeError",
				message: "Expected a positive number for width.",
			},
		);

		assert.throws(
			() => {
				convertToPng(new Uint8Array(10), 0, 16);
			},
			{
				name: "TypeError",
				message: "Expected a positive number for width.",
			},
		);
	});

	it("should throw TypeError for invalid height", () => {
		assert.throws(
			() => {
				convertToPng(new Uint8Array(10), 16, "not a number");
			},
			{
				name: "TypeError",
				message: "Expected a positive number for height.",
			},
		);

		assert.throws(
			() => {
				convertToPng(new Uint8Array(10), 16, -1);
			},
			{
				name: "TypeError",
				message: "Expected a positive number for height.",
			},
		);
	});

	it("should return PNG as-is if already PNG", () => {
		const icoData = createPngICO();
		const images = extractImages(icoData);
		const pngData = convertToPng(images[0].data, 16, 16);

		// Should be the same data
		assert.deepStrictEqual(pngData, images[0].data);
	});

	it("should convert 32-bit BMP to PNG", () => {
		const icoData = createSimple32BitICO();
		const images = extractImages(icoData);
		const pngData = convertToPng(
			images[0].data,
			images[0].width,
			images[0].height,
		);

		// Check PNG signature
		assert.strictEqual(pngData[0], 0x89);
		assert.strictEqual(pngData[1], 0x50);
		assert.strictEqual(pngData[2], 0x4e);
		assert.strictEqual(pngData[3], 0x47);
		assert.strictEqual(pngData[4], 0x0d);
		assert.strictEqual(pngData[5], 0x0a);
		assert.strictEqual(pngData[6], 0x1a);
		assert.strictEqual(pngData[7], 0x0a);

		// Check that we have IHDR, IDAT, and IEND chunks
		const ihdrPos = findChunk(pngData, "IHDR");
		const idatPos = findChunk(pngData, "IDAT");
		const iendPos = findChunk(pngData, "IEND");

		assert.ok(ihdrPos > 0, "Should have IHDR chunk");
		assert.ok(idatPos > 0, "Should have IDAT chunk");
		assert.ok(iendPos > 0, "Should have IEND chunk");
	});

	it("should handle transparency in BMP correctly", () => {
		const icoData = createTransparentICO();
		const images = extractImages(icoData);
		const pngData = convertToPng(
			images[0].data,
			images[0].width,
			images[0].height,
		);

		// Should be a valid PNG
		assert.strictEqual(pngData[0], 0x89);
		assert.strictEqual(pngData[1], 0x50);
		assert.strictEqual(pngData[2], 0x4e);
		assert.strictEqual(pngData[3], 0x47);
	});

	it("should handle multi-image ICO", () => {
		const icoData = createMultiImageICO();
		const images = extractImages(icoData);

		for (const image of images) {
			const pngData = convertToPng(image.data, image.width, image.height);

			// Should be a valid PNG
			assert.strictEqual(pngData[0], 0x89);
			assert.strictEqual(pngData[1], 0x50);
			assert.strictEqual(pngData[2], 0x4e);
			assert.strictEqual(pngData[3], 0x47);
		}
	});
});

describe("extractImagesAsPng()", () => {
	it("should throw TypeError for non-Uint8Array input", () => {
		assert.throws(
			() => {
				extractImagesAsPng("not a uint8array");
			},
			{
				name: "TypeError",
				message: "Expected a Uint8Array argument.",
			},
		);
	});

	it("should propagate invalid ICO errors", () => {
		assert.throws(
			() => {
				extractImagesAsPng(new Uint8Array(5));
			},
			{
				name: "Error",
				message: "Invalid ICO file: too small.",
			},
		);
	});

	it("should convert extracted BMP images to PNG", () => {
		const icoData = createSimple32BitICO();
		const images = extractImagesAsPng(icoData);

		assert.strictEqual(images.length, 1);
		assert.strictEqual(images[0].type, "png");
		assert.strictEqual(images[0].bpp, 32);
		assert.strictEqual(images[0].data[0], 0x89);
		assert.strictEqual(images[0].data[1], 0x50);
		assert.strictEqual(images[0].data[2], 0x4e);
		assert.strictEqual(images[0].data[3], 0x47);
	});

	it("should keep extracted PNG images as PNG", () => {
		const icoData = createPngICO();
		const extractedImages = extractImages(icoData);
		const images = extractImagesAsPng(icoData);

		assert.strictEqual(images.length, 1);
		assert.strictEqual(images[0].type, "png");
		assert.strictEqual(images[0].width, extractedImages[0].width);
		assert.strictEqual(images[0].height, extractedImages[0].height);
		assert.strictEqual(images[0].bpp, extractedImages[0].bpp);
		assert.deepStrictEqual(images[0].data, extractedImages[0].data);
		assert.strictEqual(images[0].data[0], 0x89);
		assert.strictEqual(images[0].data[1], 0x50);
		assert.strictEqual(images[0].data[2], 0x4e);
		assert.strictEqual(images[0].data[3], 0x47);
	});
});

describe("extractLargestImage()", () => {
	it("should throw TypeError for non-Uint8Array input", () => {
		assert.throws(
			() => {
				extractLargestImage("not a uint8array");
			},
			{
				name: "TypeError",
				message: "Expected a Uint8Array argument.",
			},
		);
	});

	it("should throw Error for invalid ICO data", () => {
		assert.throws(
			() => {
				extractLargestImage(new Uint8Array(5));
			},
			{
				name: "Error",
				message: "Invalid ICO file: too small.",
			},
		);
	});

	it("should return the largest image from a multi-image ICO", () => {
		const icoData = createMultiImageICO();
		const image = extractLargestImage(icoData);

		assert.strictEqual(image.width, 32);
		assert.strictEqual(image.height, 32);
		assert.strictEqual(image.type, "bmp");
	});
});

describe("extractLargestImageAsPng()", () => {
	it("should throw TypeError for non-Uint8Array input", () => {
		assert.throws(
			() => {
				extractLargestImageAsPng("not a uint8array");
			},
			{
				name: "TypeError",
				message: "Expected a Uint8Array argument.",
			},
		);
	});

	it("should throw Error for invalid ICO data", () => {
		assert.throws(
			() => {
				extractLargestImageAsPng(new Uint8Array(5));
			},
			{
				name: "Error",
				message: "Invalid ICO file: too small.",
			},
		);
	});

	it("should convert the largest BMP image to PNG", () => {
		const icoData = createMultiImageICO();
		const image = extractLargestImageAsPng(icoData);

		assert.strictEqual(image.width, 32);
		assert.strictEqual(image.height, 32);
		assert.strictEqual(image.bpp, 32);
		assert.strictEqual(image.type, "png");
		assert.strictEqual(image.data[0], 0x89);
		assert.strictEqual(image.data[1], 0x50);
		assert.strictEqual(image.data[2], 0x4e);
		assert.strictEqual(image.data[3], 0x47);
	});

	it("should return the largest image as-is when already PNG", () => {
		const icoData = createPngICO();
		const image = extractLargestImageAsPng(icoData);

		assert.strictEqual(image.width, 16);
		assert.strictEqual(image.height, 16);
		assert.strictEqual(image.bpp, 32);
		assert.strictEqual(image.type, "png");
		assert.strictEqual(image.data[0], 0x89);
		assert.strictEqual(image.data[1], 0x50);
		assert.strictEqual(image.data[2], 0x4e);
		assert.strictEqual(image.data[3], 0x47);
	});
});

//-----------------------------------------------------------------------------
// Fixture tests
//-----------------------------------------------------------------------------

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const ICO_FIXTURES = readdirSync(FIXTURES_DIR).filter(f => /\.ico$/i.test(f));

describe("Fixture ICO files", () => {
	for (const icoFile of ICO_FIXTURES) {
		describe(icoFile, () => {
			it("should extract images that match the corresponding fixture files", async () => {
				const icoData = await readFile(join(FIXTURES_DIR, icoFile));
				const images = extractImages(new Uint8Array(icoData));
				const base = basename(icoFile, ".ico");

				assert.ok(
					images.length > 0,
					"Should extract at least one image",
				);

				for (const image of images) {
					const suffix =
						images.length > 1
							? `-${image.width}x${image.height}`
							: "";
					const fixtureName = `${base}${suffix}.${image.type}`;
					const expectedData = await readFile(
						join(FIXTURES_DIR, fixtureName),
					);

					assert.deepStrictEqual(
						image.data,
						new Uint8Array(expectedData),
						`Image data for ${fixtureName} should match fixture`,
					);
				}
			});
		});
	}
});

// Helper to find chunk position in PNG
function findChunk(data, chunkName) {
	const target = new Uint8Array([
		chunkName.charCodeAt(0),
		chunkName.charCodeAt(1),
		chunkName.charCodeAt(2),
		chunkName.charCodeAt(3),
	]);

	for (let i = 8; i < data.length - 4; i++) {
		if (
			data[i] === target[0] &&
			data[i + 1] === target[1] &&
			data[i + 2] === target[2] &&
			data[i + 3] === target[3]
		) {
			return i;
		}
	}

	return -1;
}
