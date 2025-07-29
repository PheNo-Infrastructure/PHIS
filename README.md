# PHIS OpenSilex API Integration

A comprehensive Python toolkit for working with OpenSilex APIs, including data import, client utilities, and testing tools.

## 🎯 Quick Start

Your OpenSilex instance can be populated with comprehensive scientific data in minutes:

1. **Visit**: `http://98.71.237.204:8666`
2. **Login**: `admin@opensilex.org` / `admin`  
3. **Upload**: `data/website_population_measurements.csv`
4. **Result**: 21,558+ realistic scientific measurements

## 📁 Project Structure

```
├── data/                    # Generated datasets ready for import
├── docs/                    # Complete documentation
├── scripts/                 # Working scripts and utilities  
├── utils/                   # Python utility modules
├── examples/                # Usage examples
├── import_scripts/          # Data import utilities
├── opensilex_python_client/ # Generated swagger client
└── archive/                 # Historical analysis files
```

## 📊 Available Data

### Mock Scientific Dataset
- **21,558 measurements** over 90 days (April-July 2025)
- **1,590 scientific objects** (plots, plants, sensors)
- **20 variables** (height, biomass, temperature, chlorophyll, etc.)
- **7 treatments** (Control, Drought, High-N, Low-N, Heat, Cold, Salt)
- **Realistic patterns** with seasonal variations

## 🚀 Usage Methods

### Method 1: Web Interface Upload (Recommended)
```bash
# Data ready for immediate upload
Visit: http://98.71.237.204:8666
Login: admin@opensilex.org / admin
Upload: data/website_population_measurements.csv
```

### Method 2: Python API Import
```python
# Using the working client
from scripts.import_via_working_client import main
main()  # Imports data via API with authentication
```

### Method 3: Direct API Calls
```python
# Using corrected base path
import opensilex_swagger_client
config = opensilex_swagger_client.Configuration()
config.host = "http://98.71.237.204:8666/rest"  # Note: /rest base path required
```

## 🔧 Key Solutions Implemented

### Authentication Fix
- **Issue**: Swagger client missing `/rest` base path
- **Solution**: `scripts/find_correct_base_path.py` discovers correct API endpoints
- **Result**: Working authentication with admin credentials

### Data Generation  
- **Script**: `scripts/populate_website_demo.py`
- **Output**: Professional-quality scientific data with proper patterns
- **Features**: Realistic growth curves, treatment effects, confidence levels

### Import Tools
- **Working Method**: `scripts/import_via_working_client.py`
- **Utilities**: Complete auth management in `utils/auth_manager.py`
- **Fallback**: Web interface instructions in `docs/IMPORT_INSTRUCTIONS.md`

## 📖 Documentation

- **Complete Status**: `docs/FINAL_STATUS_REPORT.md`
- **User Guide**: `docs/IMPORT_INSTRUCTIONS.md`
- **API Analysis**: `archive/analysis/` - endpoint mismatch solutions
- **Test Results**: `archive/testing/` - comprehensive API testing

## 🛠️ Development

### Required Dependencies
```bash
pip install opensilex-swagger-client pandas requests python-dateutil
```

### Core Utilities
- `utils/auth_manager.py` - Authentication and token management
- `utils/api_wrapper.py` - High-level API wrapper functions
- `opensilex_client.py` - Main client library

### Working Scripts
- `scripts/populate_website_demo.py` - Generate mock scientific data
- `scripts/import_via_working_client.py` - Import data via API
- `scripts/find_correct_base_path.py` - Discover API endpoints

## 🎯 Mission Status: Complete

✅ **API Testing**: Comprehensive endpoint analysis completed  
✅ **Mock Data**: 21,558 realistic measurements generated  
✅ **Import Methods**: Multiple working approaches developed  
✅ **Authentication**: Admin credentials confirmed working  
✅ **Documentation**: Complete user guides and technical analysis  
✅ **Endpoint Issues**: Root cause identified and solved  

**Your OpenSilex platform is ready to be populated with comprehensive scientific data using any of the provided methods.**

---

## Previous Installation Guide

For Azure VM deployment and OpenSilex installation, see the comprehensive guide that was previously in this README. The installation content has been preserved and can be found in the repository history or in the separate installation documentation.

The current README focuses on the Python API integration and data import tools that were developed for working with an existing OpenSilex instance.