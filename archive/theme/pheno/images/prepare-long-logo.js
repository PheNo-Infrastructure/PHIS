/**
 * Prepare PheNo long logo for navbar
 * Converts SVG to PNG at the appropriate size
 */

const sharp = require('sharp');
const path = require('path');

const imagesDir = __dirname; // We're already in the images directory

async function prepareLongLogo() {
    console.log('Preparing PheNo long logo for navbar (high resolution)...');

    try {
        // Convert the white long logo to PNG for navbar at 2x resolution for crisp display
        // Height of 80px (2x target display size of 40px), width will auto-scale proportionally
        await sharp(path.join(imagesDir, 'PheNo_logo_long_White.svg'))
            .resize(null, 80, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toFile(path.join(imagesDir, 'pheno-logo-navbar.png'));

        console.log('✓ Created pheno-logo-navbar.png (height: 80px @2x, displays at ~40px)');

        // Also create a version for the miniature (84px height for 2x resolution)
        await sharp(path.join(imagesDir, 'PheNo_logo_long_White.svg'))
            .resize(null, 84, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toFile(path.join(imagesDir, 'pheno-logo-navbar-mini.png'));

        console.log('✓ Created pheno-logo-navbar-mini.png (height: 84px @2x, displays at ~42px)');

        console.log('\nHigh-resolution logo preparation complete!');
    } catch (error) {
        console.error('Error preparing logo:', error);
        process.exit(1);
    }
}

prepareLongLogo();
