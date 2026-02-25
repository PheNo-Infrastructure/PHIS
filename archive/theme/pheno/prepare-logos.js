#!/usr/bin/env node
/**
 * PheNo Logo Preparation Script
 * Resizes PheNo logos to the sizes required by OpenSILEX
 */

// Try to load sharp from images/node_modules first, then fallback to global
let sharp;
try {
  sharp = require('./images/node_modules/sharp');
} catch (e) {
  sharp = require('sharp');
}

const path = require('path');
const fs = require('fs');

const sizes = [
  { input: 'pheno-icon.png', output: 'pheno-icon-42.png', size: 42, description: 'Miniature logo (navbar)' },
  { input: 'pheno-icon.png', output: 'pheno-icon-216.png', size: 216, description: 'Main logo' },
  { input: 'pheno-icon.png', output: 'pheno-icon-224.png', size: 224, description: 'Loading screen logo' }
];

async function resizeLogos() {
  console.log('PheNo Logo Preparation');
  console.log('======================\n');

  const imagesDir = path.join(__dirname, 'images');

  for (const config of sizes) {
    const inputPath = path.join(imagesDir, config.input);
    const outputPath = path.join(imagesDir, config.output);

    if (!fs.existsSync(inputPath)) {
      console.error(`❌ Error: ${config.input} not found`);
      process.exit(1);
    }

    try {
      await sharp(inputPath)
        .resize(config.size, config.size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`✓ Created ${config.output} (${config.size}x${config.size}) - ${(stats.size / 1024).toFixed(1)}KB`);
      console.log(`  Purpose: ${config.description}`);
    } catch (error) {
      console.error(`❌ Error creating ${config.output}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n✅ All logos prepared successfully!');
}

resizeLogos().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
