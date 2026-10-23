#!/bin/sh
# Swap the OpenSILEX/bootstrap blues and teal for PheNo greens.
# Many Vue components hardcode these colors in <style scoped>, which a theme
# stylesheet cannot override, so they are rewritten in the sources before the build.
# Usage: pheno-colors.sh <opensilex source root>
set -e
cd "$1"
find . -path ./node_modules -prune -o -path '*/node_modules' -prune -o \
     \( -path '*/front/src/*' -o -path './opensilex-front/front/theme/opensilex/*' \) \
     -type f \( -name '*.vue' -o -name '*.scss' -o -name '*.css' -o -name '*.ts' \) -print0 |
  xargs -0 sed -i -E \
    -e 's/#00a38d\b/#3d8526/gI' \
    -e 's/#00a28c\b/#3d8526/gI' \
    -e 's/#018371\b/#264030/gI' \
    -e 's/#007bff\b/#3d8526/gI' \
    -e 's/#448aff\b/#3d8526/gI' \
    -e 's/#536dfe\b/#3d8526/gI'
echo "pheno colors applied"
