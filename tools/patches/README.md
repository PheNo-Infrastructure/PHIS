# OpenSILEX Patches

This directory contains patches applied during Docker build to fix critical bugs in OpenSILEX 1.4.9-rdg.

## Patches

### 001-groupdao-nullpointer-fix.patch
**Issue**: NullPointerException when loading groups during authentication
**Root cause**: `SPARQLQueryHelper.inURIFilter()` can return null when the URI list is empty
**Fix**: Add null check before calling `select.addFilter(filter)`
**Affects**: User authentication and group loading
**Status**: Required for production

### 002-accountdao-autogroup.patch (TODO)
**Issue**: Feide user credentials not automatically assigned to groups
**Root cause**: AccountDAO missing auto-group assignment logic
**Fix**: TBD
**Status**: Planned

## Applying Patches

Patches are automatically applied during `docker build` via the Dockerfile.

To test patches locally:
```bash
cd /path/to/opensilex/source
patch -p1 < patches/001-groupdao-nullpointer-fix.patch
```

To create new patches:
```bash
# Make your changes in the source
git diff > patches/003-new-fix.patch
```
