# OpenSilex Python Client

This directory contains a complete Python client for the OpenSilex API, generated using **Swagger Codegen** for optimal compatibility and functionality.

## 🏆 Client Selection

After comprehensive testing, **Swagger Codegen was chosen over OpenAPI Generator** due to:
- ✅ **88.9% test pass rate** vs 33.3% for OpenAPI Generator
- ✅ **Complete model coverage** - all DTOs generated successfully
- ✅ **No manual fixes required** - works out of the box
- ✅ **Better specification handling** - no validation skip needed
- ✅ **Additional specialized models** not available in OpenAPI Generator

## 📁 Directory Structure

```
├── opensilex_python_client/          # Generated Python client
│   ├── opensilex_swagger_client/     # Python package
│   ├── docs/                         # API documentation
│   ├── test/                         # Test suite
│   └── README.md                     # Client-specific documentation
├── generate_swagger_client.ps1       # Generation script
├── example_usage.py                  # Usage examples
├── openapi_spec.json                 # API specification
└── swagger-codegen-cli.jar           # Generator tool
```

## 🚀 Quick Start

### 1. Install the Client

```bash
pip install -e ./opensilex_python_client
```

### 2. Basic Usage

```python
import opensilex_swagger_client

# Configure the client
api_client = opensilex_swagger_client.ApiClient()
api_client.configuration.host = "http://your-server:8666"

# Use any API
auth_api = opensilex_swagger_client.AuthenticationApi(api_client)
sys_api = opensilex_swagger_client.SystemApi(api_client)
data_api = opensilex_swagger_client.DataApi(api_client)
```

### 3. Authentication

```python
# Method 1: Direct authentication
auth_dto = opensilex_swagger_client.AuthenticationDTO(
    identifier="your_username",
    password="your_password"
)
response = auth_api.authenticate(auth_dto)
token = response.result.token

# Method 2: Set token directly
api_client.set_default_header('Authorization', f'Bearer {token}')
```

## 📚 Available APIs

The client provides access to **23 API categories**:

- **Core APIs**: Authentication, System, Security
- **Data Management**: Data, Documents, Variables
- **Scientific Objects**: Experiments, Scientific Objects, Positions
- **Ontology**: Ontology, Annotations, Species
- **External Integration**: BRAPI, Faidare, Agroportal
- **Organization**: Organizations, Projects, Groups
- **Advanced**: Metrics, Factors, Areas, Events

## 🔧 Key Features

### Complete Model Coverage
- ✅ All standard DTOs (AuthenticationDTO, DataCreationDTO, etc.)
- ✅ Specialized models (Capabilities, Lock, GraphEventManager)
- ✅ Form parameter models for file uploads
- ✅ GeoJSON and spatial data support

### Robust Functionality
- ✅ Proper parameter handling (especially ontology endpoints)
- ✅ Complete API coverage
- ✅ File upload support
- ✅ Error handling and exceptions

### Developer-Friendly
- ✅ Comprehensive documentation in `docs/` folder
- ✅ Complete test coverage in `test/` folder
- ✅ Working examples in `example_usage.py`

## 🛠️ Regenerating the Client

If the API specification changes, regenerate the client:

```powershell
.\generate_swagger_client.ps1
```

Or manually:
```bash
java -jar swagger-codegen-cli.jar generate \
  -i openapi_spec.json \
  -l python \
  -o opensilex_python_client \
  --additional-properties packageName=opensilex_swagger_client
```

## 📖 Documentation

- **API Documentation**: See `opensilex_python_client/docs/` for detailed API docs
- **Usage Examples**: Run `python example_usage.py` for comprehensive examples
- **Model Reference**: All models available in `opensilex_swagger_client` module

## 🔍 Testing

The client has been thoroughly tested and validated:
- ✅ Import and initialization tests
- ✅ API class availability verification
- ✅ Model completeness validation
- ✅ Parameter handling verification
- ✅ Authentication flow testing

## 🌐 Server Configuration

Update the server URL in your code:
```python
api_client.configuration.host = "http://your-opensilex-server:port"
```

Default configuration points to: `http://98.71.237.204:8666`

## 📝 Notes

- **Python 2/3 Compatible**: Works with both Python versions
- **Dependency Requirements**: See `requirements.txt` in client directory
- **SSL Support**: Configurable SSL verification
- **Timeout Handling**: Built-in request timeout management

## 🤝 Support

For API-specific questions, refer to the OpenSilex documentation.
For client issues, check the generated documentation in the `docs/` folder.

---

**Generated with Swagger Codegen for maximum compatibility and functionality.**