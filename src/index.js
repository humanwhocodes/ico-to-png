/**
 * @fileoverview ICO to PNG converter with no dependencies.
 * @author Nicholas C. Zakas
 */

/* @ts-self-types="./index.d.ts" */

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

/**
 * Reads a 16-bit unsigned integer from a Uint8Array in little-endian format.
 * @param {Uint8Array} data The data to read from.
 * @param {number} offset The offset to read from.
 * @returns {number} The 16-bit unsigned integer.
 */
function readUInt16LE(data, offset) {
	return data[offset] | (data[offset + 1] << 8);
}

/**
 * Reads a 32-bit unsigned integer from a Uint8Array in little-endian format.
 * @param {Uint8Array} data The data to read from.
 * @param {number} offset The offset to read from.
 * @returns {number} The 32-bit unsigned integer.
 */
function readUInt32LE(data, offset) {
	return (
		data[offset] |
		(data[offset + 1] << 8) |
		(data[offset + 2] << 16) |
		(data[offset + 3] << 24)
	);
}

/**
 * Writes a 32-bit unsigned integer to a Uint8Array in big-endian format.
 * @param {Uint8Array} data The data to write to.
 * @param {number} offset The offset to write to.
 * @param {number} value The value to write.
 * @returns {void}
 */
function writeUInt32BE(data, offset, value) {
	data[offset] = (value >>> 24) & 0xff;
	data[offset + 1] = (value >>> 16) & 0xff;
	data[offset + 2] = (value >>> 8) & 0xff;
	data[offset + 3] = value & 0xff;
}

/**
 * Calculates the CRC32 checksum of data.
 * @param {Uint8Array} data The data to calculate the checksum for.
 * @returns {number} The CRC32 checksum.
 */
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

/**
 * Checks if data is a PNG by looking for the PNG signature.
 * @param {Uint8Array} data The data to check.
 * @returns {boolean} True if the data is a PNG.
 */
function isPNG(data) {
	return (
		data.length >= 8 &&
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47 &&
		data[4] === 0x0d &&
		data[5] === 0x0a &&
		data[6] === 0x1a &&
		data[7] === 0x0a
	);
}

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

/**
 * Extracts all images from ICO file data.
 * @param {Uint8Array} icoData The ICO file data.
 * @returns {Array<{data: Uint8Array, width: number, height: number, bpp: number, type: "bmp"|"png"}>} Array of extracted images.
 * @throws {TypeError} If icoData is not a Uint8Array.
 * @throws {Error} If the ICO file is invalid.
 */
export function extractImages(icoData) {
	if (!(icoData instanceof Uint8Array)) {
		throw new TypeError("Expected a Uint8Array argument.");
	}

	if (icoData.length < 6) {
		throw new Error("Invalid ICO file: too small.");
	}

	// Read ICO header
	const reserved = readUInt16LE(icoData, 0);
	const type = readUInt16LE(icoData, 2);
	const count = readUInt16LE(icoData, 4);

	if (reserved !== 0 || type !== 1) {
		throw new Error("Invalid ICO file: bad header.");
	}

	if (count === 0) {
		throw new Error("Invalid ICO file: no images.");
	}

	const images = [];

	// Read directory entries
	for (let i = 0; i < count; i++) {
		const entryOffset = 6 + i * 16;

		if (icoData.length < entryOffset + 16) {
			throw new Error("Invalid ICO file: truncated directory entry.");
		}

		const width = icoData[entryOffset] || 256;
		const height = icoData[entryOffset + 1] || 256;
		const colorCount = icoData[entryOffset + 2];
		const bpp = readUInt16LE(icoData, entryOffset + 6);
		const size = readUInt32LE(icoData, entryOffset + 8);
		const offset = readUInt32LE(icoData, entryOffset + 12);

		if (offset + size > icoData.length) {
			throw new Error("Invalid ICO file: image data out of bounds.");
		}

		const imageData = icoData.slice(offset, offset + size);

		images.push({
			data: imageData,
			width,
			height,
			bpp: bpp || (colorCount === 0 ? 32 : 8),
			type: /** @type {"png"|"bmp"} */ (isPNG(imageData) ? "png" : "bmp"),
		});
	}

	return images;
}

/**
 * Extracts all images from ICO file data and converts BMP images to PNG.
 * @param {Uint8Array} icoData The ICO file data.
 * @returns {Array<{data: Uint8Array, width: number, height: number, bpp: number, type: "png"}>} Array of extracted images as PNG.
 * @throws {TypeError} If icoData is not a Uint8Array.
 * @throws {Error} If the ICO file is invalid.
 */
export function extractImagesAsPng(icoData) {
	return extractImages(icoData).map(image => {
		const data =
			image.type === "bmp"
				? convertToPng(image.data, image.width, image.height)
				: image.data;

		return {
			...image,
			data,
			type: "png",
		};
	});
}

/**
 * Converts an image from ICO format to PNG format.
 * If the image is already a PNG, it's returned as-is.
 * If the image is a BMP, it's converted to PNG.
 * @param {Uint8Array} imageData The image data from an ICO file.
 * @param {number} width The width of the image.
 * @param {number} height The height of the image.
 * @returns {Uint8Array} The PNG image data.
 * @throws {TypeError} If arguments are invalid.
 * @throws {Error} If conversion fails.
 */
export function convertToPng(imageData, width, height) {
	if (!(imageData instanceof Uint8Array)) {
		throw new TypeError("Expected a Uint8Array argument.");
	}

	if (typeof width !== "number" || width <= 0) {
		throw new TypeError("Expected a positive number for width.");
	}

	if (typeof height !== "number" || height <= 0) {
		throw new TypeError("Expected a positive number for height.");
	}

	// If already PNG, return as-is
	if (isPNG(imageData)) {
		return imageData;
	}

	// Parse BMP header
	const headerSize = readUInt32LE(imageData, 0);

	if (headerSize !== 40) {
		throw new Error(
			"Unsupported BMP format: only BITMAPINFOHEADER is supported.",
		);
	}

	const bmpWidth = readUInt32LE(imageData, 4);
	const bmpHeight = readUInt32LE(imageData, 8);
	const bpp = readUInt16LE(imageData, 14);
	const compression = readUInt32LE(imageData, 16);

	// ICO BMPs have double height (includes AND mask)
	const actualHeight = Math.abs(bmpHeight) / 2;

	// Validate the height is as expected for ICO format
	if (actualHeight !== height) {
		throw new Error(
			`BMP height mismatch: expected ${height}, got ${actualHeight}.`,
		);
	}

	if (compression !== 0) {
		throw new Error("Unsupported BMP format: compression not supported.");
	}

	// Calculate sizes
	const colorTableSize = bpp <= 8 ? Math.pow(2, bpp) * 4 : 0;
	const xorOffset = 40 + colorTableSize;
	const rowSize = Math.floor((bpp * bmpWidth + 31) / 32) * 4;
	const xorSize = rowSize * actualHeight;
	const andRowSize = Math.floor((bmpWidth + 31) / 32) * 4;
	const andOffset = xorOffset + xorSize;

	// Create RGBA data
	const rgbaData = new Uint8Array(bmpWidth * actualHeight * 4);

	// Read color table if present
	let colorTable = null;

	if (colorTableSize > 0) {
		colorTable = new Uint8Array(colorTableSize);
		colorTable.set(imageData.slice(40, 40 + colorTableSize));
	}

	// Convert BMP to RGBA
	for (let y = 0; y < actualHeight; y++) {
		// BMP rows are stored bottom-to-top
		const bmpRow = actualHeight - 1 - y;
		const xorRowOffset = xorOffset + bmpRow * rowSize;
		const andRowOffset = andOffset + bmpRow * andRowSize;

		for (let x = 0; x < bmpWidth; x++) {
			const rgbaOffset = (y * bmpWidth + x) * 4;

			// Read AND mask bit (for transparency)
			const andByteOffset = andRowOffset + Math.floor(x / 8);
			const andBitOffset = 7 - (x % 8);
			const andBit =
				andByteOffset < imageData.length
					? (imageData[andByteOffset] >> andBitOffset) & 1
					: 0;

			let r, g, b, a;

			if (bpp === 32) {
				// 32-bit BGRA
				const pixelOffset = xorRowOffset + x * 4;
				b = imageData[pixelOffset];
				g = imageData[pixelOffset + 1];
				r = imageData[pixelOffset + 2];
				a = imageData[pixelOffset + 3];

				// If AND mask bit is set and alpha is 0, it's transparent
				if (andBit === 1 && a === 0) {
					a = 0;
				}
			} else if (bpp === 24) {
				// 24-bit BGR
				const pixelOffset = xorRowOffset + x * 3;
				b = imageData[pixelOffset];
				g = imageData[pixelOffset + 1];
				r = imageData[pixelOffset + 2];
				a = andBit === 1 ? 0 : 255;
			} else if (bpp === 8) {
				// 8-bit indexed
				const pixelOffset = xorRowOffset + x;
				const index = imageData[pixelOffset];
				const colorOffset = index * 4;

				if (colorTable && colorOffset + 3 < colorTable.length) {
					b = colorTable[colorOffset];
					g = colorTable[colorOffset + 1];
					r = colorTable[colorOffset + 2];
					a = andBit === 1 ? 0 : 255;
				} else {
					r = g = b = 0;
					a = 0;
				}
			} else if (bpp === 4) {
				// 4-bit indexed
				const pixelOffset = xorRowOffset + Math.floor(x / 2);
				const nibble =
					x % 2 === 0
						? (imageData[pixelOffset] >> 4) & 0x0f
						: imageData[pixelOffset] & 0x0f;
				const colorOffset = nibble * 4;

				if (colorTable && colorOffset + 3 < colorTable.length) {
					b = colorTable[colorOffset];
					g = colorTable[colorOffset + 1];
					r = colorTable[colorOffset + 2];
					a = andBit === 1 ? 0 : 255;
				} else {
					r = g = b = 0;
					a = 0;
				}
			} else if (bpp === 1) {
				// 1-bit indexed
				const pixelOffset = xorRowOffset + Math.floor(x / 8);
				const bit = (imageData[pixelOffset] >> (7 - (x % 8))) & 1;
				const colorOffset = bit * 4;

				if (colorTable && colorOffset + 3 < colorTable.length) {
					b = colorTable[colorOffset];
					g = colorTable[colorOffset + 1];
					r = colorTable[colorOffset + 2];
					a = andBit === 1 ? 0 : 255;
				} else {
					r = g = b = bit === 1 ? 255 : 0;
					a = andBit === 1 ? 0 : 255;
				}
			} else {
				throw new Error(`Unsupported BMP format: ${bpp} bpp.`);
			}

			rgbaData[rgbaOffset] = r;
			rgbaData[rgbaOffset + 1] = g;
			rgbaData[rgbaOffset + 2] = b;
			rgbaData[rgbaOffset + 3] = a;
		}
	}

	// Create PNG
	return createPNG(rgbaData, bmpWidth, actualHeight);
}

/**
 * Creates a PNG file from RGBA data.
 * @param {Uint8Array} rgbaData The RGBA pixel data.
 * @param {number} width The width of the image.
 * @param {number} height The height of the image.
 * @returns {Uint8Array} The PNG file data.
 */
function createPNG(rgbaData, width, height) {
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
	ihdrData[10] = 0; // compression method
	ihdrData[11] = 0; // filter method
	ihdrData[12] = 0; // interlace method

	const ihdrChunk = createChunk(new Uint8Array([73, 72, 68, 82]), ihdrData);

	// IDAT chunk - compress the image data
	const filteredData = new Uint8Array(height * (1 + width * 4));

	for (let y = 0; y < height; y++) {
		filteredData[y * (1 + width * 4)] = 0; // filter type: None
		const rowStart = y * width * 4;
		const destStart = y * (1 + width * 4) + 1;
		filteredData.set(
			rgbaData.slice(rowStart, rowStart + width * 4),
			destStart,
		);
	}

	const compressedData = deflate(filteredData);
	const idatChunk = createChunk(
		new Uint8Array([73, 68, 65, 84]),
		compressedData,
	);

	// IEND chunk
	const iendChunk = createChunk(
		new Uint8Array([73, 69, 78, 68]),
		new Uint8Array(0),
	);

	// Combine all chunks
	const pngSize =
		signature.length +
		ihdrChunk.length +
		idatChunk.length +
		iendChunk.length;
	const png = new Uint8Array(pngSize);
	let offset = 0;

	png.set(signature, offset);
	offset += signature.length;
	png.set(ihdrChunk, offset);
	offset += ihdrChunk.length;
	png.set(idatChunk, offset);
	offset += idatChunk.length;
	png.set(iendChunk, offset);

	return png;
}

/**
 * Creates a PNG chunk.
 * @param {Uint8Array} type The chunk type (4 bytes).
 * @param {Uint8Array} data The chunk data.
 * @returns {Uint8Array} The complete chunk.
 */
function createChunk(type, data) {
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

/**
 * Simple DEFLATE compression implementation.
 * Note: This implementation creates uncompressed DEFLATE blocks, which is
 * valid according to the DEFLATE specification but results in larger PNG files.
 * This approach prioritizes simplicity and zero dependencies over file size.
 * @param {Uint8Array} data The data to compress.
 * @returns {Uint8Array} The compressed data.
 */
function deflate(data) {
	// Create a simple uncompressed DEFLATE stream
	// This is valid but not optimally compressed
	const maxBlockSize = 65535;
	const numBlocks = Math.ceil(data.length / maxBlockSize);
	let compressedSize = 0;

	// Calculate size: each block has 5 bytes header + data
	for (let i = 0; i < numBlocks; i++) {
		const blockSize = Math.min(
			maxBlockSize,
			data.length - i * maxBlockSize,
		);
		compressedSize += 5 + blockSize;
	}

	const compressed = new Uint8Array(compressedSize + 2); // +2 for zlib header

	// zlib header
	compressed[0] = 0x78; // CMF
	compressed[1] = 0x01; // FLG (no compression)

	let offset = 2;

	for (let i = 0; i < numBlocks; i++) {
		const blockStart = i * maxBlockSize;
		const blockSize = Math.min(maxBlockSize, data.length - blockStart);
		const isFinal = i === numBlocks - 1 ? 1 : 0;

		// DEFLATE block header
		compressed[offset] = isFinal; // BFINAL and BTYPE (00 = no compression)
		compressed[offset + 1] = blockSize & 0xff; // LEN low byte
		compressed[offset + 2] = (blockSize >> 8) & 0xff; // LEN high byte
		compressed[offset + 3] = ~blockSize & 0xff; // NLEN low byte
		compressed[offset + 4] = (~blockSize >> 8) & 0xff; // NLEN high byte

		// Copy data
		compressed.set(
			data.slice(blockStart, blockStart + blockSize),
			offset + 5,
		);

		offset += 5 + blockSize;
	}

	// Calculate Adler-32 checksum
	const adler = adler32(data);
	compressed[offset] = (adler >> 24) & 0xff;
	compressed[offset + 1] = (adler >> 16) & 0xff;
	compressed[offset + 2] = (adler >> 8) & 0xff;
	compressed[offset + 3] = adler & 0xff;

	return compressed;
}

/**
 * Calculates the Adler-32 checksum.
 * @param {Uint8Array} data The data to calculate the checksum for.
 * @returns {number} The Adler-32 checksum.
 */
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
