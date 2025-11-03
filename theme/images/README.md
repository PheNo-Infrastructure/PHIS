# PheNo Logo Files

This directory contains the PheNo logo assets used in the OpenSILEX interface.

## Required Logo Files

Based on the PheNo Design Guidelines, please add the following logo files to this directory:

### Logo Variants Needed

1. **pheno-logo-green.svg** or **pheno-logo-green.png**
   - Full color green logo for light backgrounds
   - Usage: Main navigation bar, header
   - Recommended size: SVG (vector) or PNG at 400px width minimum

2. **pheno-logo-white.svg** or **pheno-logo-white.png**
   - White logo for dark backgrounds
   - Usage: Dark mode, footer
   - Recommended size: SVG (vector) or PNG at 400px width minimum

3. **pheno-logo-black.svg** or **pheno-logo-black.png**
   - Black logo for non-brand colored backgrounds
   - Usage: Documents, reports
   - Recommended size: SVG (vector) or PNG at 400px width minimum

4. **pheno-icon.svg** or **pheno-icon.png**
   - Logo icon only (the circular leaf symbol)
   - Usage: Favicon, small icons
   - Recommended size: 64x64px minimum

5. **pheno-logo-full-name.svg** or **pheno-logo-full-name.png** (Optional)
   - Logo with full text "Norwegian Plant Phenotyping Infrastructure"
   - Usage: Large surfaces only (as per design guidelines)
   - Recommended size: SVG (vector) or PNG at 800px width minimum

## File Format Recommendations

- **SVG** (Scalable Vector Graphics): Preferred for all logos - scales perfectly at any size
- **PNG** with transparent background: Alternative if SVG not available
- **High resolution**: Minimum 2x the display size for retina displays

## Logo Placement Guidelines

From the PheNo Design Guidelines:

- **Spacing**: Logo should have spacing equal to the height of a lowercase letter (e or o)
- **Position**: Top left for most cases, bottom for signatures
- **Background colors**:
  - White background: Use green or black logo
  - Light PheNo colors: Use green or black logo
  - Light non-PheNo colors: Use black logo
  - Dark backgrounds: Use white logo

## Color Specifications

- **Green (Light Leaf)**: #87CF82
- **Green (Dark Leaf)**: #3D8526
- **Forest Green**: #264030
- **White**: #FFFFFF
- **Black**: #000000

## Extracting Logos from PDF

If you need to extract logos from the design guidelines PDF:

1. Open the PDF in a vector graphics editor (Adobe Illustrator, Inkscape)
2. Select and copy the logo
3. Export as SVG or PNG with transparent background
4. Save to this directory with appropriate filename

## Usage in OpenSILEX

These logo files are automatically deployed to the server at:
`/home/azureuser/opensilex/data/files/theme/images/`

The logo is referenced in the OpenSILEX configuration file.
