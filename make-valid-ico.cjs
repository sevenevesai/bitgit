const fs = require('fs');

// Create a minimal valid 32x32 ICO file
const SIZE = 32;
const BPP = 32; // bits per pixel
const PALETTE_SIZE = 0;

// Calculate sizes
const imageDataSize = SIZE * SIZE * 4; // RGBA
const dibHeaderSize = 40;
const totalImageSize = dibHeaderSize + imageDataSize;

const buffer = Buffer.alloc(6 + 16 + totalImageSize);
let offset = 0;

// ICO Header (6 bytes)
buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
buffer.writeUInt16LE(1, offset); offset += 2; // Type (1 = ICO)
buffer.writeUInt16LE(1, offset); offset += 2; // Number of images

// Image Directory (16 bytes)
buffer.writeUInt8(SIZE, offset); offset += 1; // Width
buffer.writeUInt8(SIZE, offset); offset += 1; // Height
buffer.writeUInt8(0, offset); offset += 1; // Color palette
buffer.writeUInt8(0, offset); offset += 1; // Reserved
buffer.writeUInt16LE(1, offset); offset += 2; // Color planes
buffer.writeUInt16LE(BPP, offset); offset += 2; // Bits per pixel
buffer.writeUInt32LE(totalImageSize, offset); offset += 4; // Image data size
buffer.writeUInt32LE(22, offset); offset += 4; // Offset (6 + 16)

// DIB Header (40 bytes)
buffer.writeUInt32LE(dibHeaderSize, offset); offset += 4; // Header size
buffer.writeInt32LE(SIZE, offset); offset += 4; // Width
buffer.writeInt32LE(SIZE * 2, offset); offset += 4; // Height (doubled for AND mask)
buffer.writeUInt16LE(1, offset); offset += 2; // Planes
buffer.writeUInt16LE(BPP, offset); offset += 2; // Bits per pixel
buffer.writeUInt32LE(0, offset); offset += 4; // Compression (0 = none)
buffer.writeUInt32LE(imageDataSize, offset); offset += 4; // Image size
buffer.writeInt32LE(0, offset); offset += 4; // X pixels per meter
buffer.writeInt32LE(0, offset); offset += 4; // Y pixels per meter
buffer.writeUInt32LE(0, offset); offset += 4; // Colors used
buffer.writeUInt32LE(0, offset); offset += 4; // Important colors

// Pixel data (32x32, BGRA format, bottom-up)
// Teal color: #14B8A6
for (let y = SIZE - 1; y >= 0; y--) {
  for (let x = 0; x < SIZE; x++) {
    buffer.writeUInt8(0xA6, offset++); // B
    buffer.writeUInt8(0xB8, offset++); // G
    buffer.writeUInt8(0x14, offset++); // R
    buffer.writeUInt8(0xFF, offset++); // A (fully opaque)
  }
}

fs.writeFileSync('src-tauri/icons/icon.ico', buffer);
console.log(`Created valid icon.ico (${buffer.length} bytes)`);
