# PheNo Theme for OpenSILEX

This directory contains a custom theme for OpenSILEX based on the PheNo (Norwegian Plant Phenotyping Infrastructure) Design Guidelines.

## Theme Structure

This theme follows the OpenSILEX theme structure:

- `opensilex.yml` - Theme configuration (lists SCSS files, fonts, icons)
- `_settings.scss` - PheNo color palette and typography settings
- `theme.scss` - Main SCSS file with PheNo-specific overrides
- `_*.scss` - Component SCSS files (buttons, forms, navigation, etc.)
- `*.css` - Compiled CSS files (main.css, fix.css, hamburgers.css)
- `images/` - PheNo logos and branding images

## PheNo Color Palette

- **Forest Green** (#264030) - Primary brand color for headers and navigation
- **Leaf Green Dark** (#3D8526) - Primary buttons and interactive elements
- **Leaf Green Light** (#87CF82) - Success states and highlights
- **Straw Dark** (#E3EBA1) - Info states and secondary elements
- **Straw Light** (#F2F5DE) - Backgrounds and subtle elements

## Typography

The theme uses the **Aptos font family** as specified in the PheNo Design Guidelines, with fallbacks to system fonts.

## Deployment

To deploy this theme to an OpenSILEX instance:

1. The theme must be injected into the `opensilex-front.jar` file
2. The theme directory must be placed at `front/theme/pheno/` inside the JAR
3. OpenSILEX must be configured to use the 'pheno' theme

See [../README-PHENO-THEME.md](../README-PHENO-THEME.md) for detailed deployment instructions.

## Logo Files

The `images/` directory contains PheNo logo variants:

- `PheNo_logo_long_Green.svg` - Full logo with green text (primary)
- `PheNo_logo_long_White.svg` - Full logo with white text (dark backgrounds)
- `PheNo_logo_long_Black.svg` - Full logo with black text (light backgrounds)
- `pheno-logo-green.svg` - Logo mark only, green
- `pheno-logo-white.svg` - Logo mark only, white
- `pheno-logo-black.svg` - Logo mark only, black
- `pheno-icon.png` - Favicon/icon

## Customization

To modify the theme:

1. Edit `_settings.scss` to change colors or typography
2. Edit `theme.scss` to add custom style overrides
3. Run the deployment script to rebuild and deploy
4. Restart OpenSILEX to see changes

## References

- PheNo Design Guidelines (PDF)
- OpenSILEX documentation: https://github.com/OpenSILEX/opensilex
- OpenSILEX theme structure: `opensilex-front/front/theme/`
