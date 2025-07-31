# OpenSilex Python Client - Enhanced with Utilities

## 🎉 **What's New**

Your OpenSilex Python client now includes a complete set of **utility scripts** that make it incredibly easy to work with the OpenSilex API. No more fighting with authentication, required fields, or complex API calls!

## 📁 **Project Structure**

```
your_project/
├── 🚀 opensilex_client.py          # ONE-FILE SOLUTION (recommended)
├── 🎯 simple_example.py            # Quick start example
├── 📖 USAGE_GUIDE.md               # Complete documentation
├── 📖 ORCHESTRATOR_README.md       # Orchestrator details
│
├── 🛠️ utils/                        # Individual utility classes
│   ├── auth_manager.py             # Authentication & token management
│   ├── api_wrapper.py              # High-level API operations
│   ├── model_helpers.py            # Model creation & validation
│   ├── config.py                   # Configuration management
│   └── __init__.py                 # Package initialization
│
├── 📚 examples/                     # Detailed examples
│   ├── basic_usage.py              # Introduction to utilities
│   ├── data_management.py          # Data operations
│   ├── experiment_management.py    # Experiment operations
│   └── README.md                   # Examples documentation
│
└── opensilex_python_client/        # Original generated client
    ├── opensilex_swagger_client/
    ├── docs/
    └── test/
```

## ⚡ **Ultra-Quick Start**

### **Option 1: One-Line Solution (Recommended)**
```python
from opensilex_client import connect

# Connect and authenticate
client = connect()

# Use immediately
client.add_data_point("http://plot/1", "http://var/height", 25.4)
experiments = client.list_experiments()
client.create_experiment("My Study", "Testing the new client")
```

### **Option 2: Individual Utilities (Advanced)**
```python
from utils import quick_auth, create_api_wrapper

auth_manager = quick_auth()
api = create_api_wrapper(auth_manager)
```

## 🎯 **Choose Your Style**

| Approach | Best For | Complexity | Setup |
|----------|----------|------------|-------|
| **🚀 Orchestrator** | Quick scripts, beginners, most use cases | Simple | 1 line |
| **🔧 Individual Utils** | Complex integrations, custom flows | Advanced | 3-4 lines |
| **📦 Raw Client** | Maximum control, library integration | Expert | 10+ lines |

## 🚀 **What the Orchestrator Gives You**

### **Before (Raw Client)**
```python
import opensilex_swagger_client
from datetime import datetime

# Complex setup
api_client = opensilex_swagger_client.ApiClient()
api_client.configuration.host = "http://server:8666"
auth_api = opensilex_swagger_client.AuthenticationApi(api_client)

# Authentication
auth_dto = opensilex_swagger_client.AuthenticationDTO(
    identifier="username", password="password"
)
response = auth_api.authenticate(auth_dto)
api_client.set_default_header('Authorization', f'Bearer {response.result.token}')

# Create data
data_api = opensilex_swagger_client.DataApi(api_client)
data_dto = opensilex_swagger_client.DataCreationDTO(
    target="http://plot/1",
    variable="http://var/height", 
    _date=datetime.now(),
    value=25.4  # This field was required but not obvious!
)
result = data_api.add_list_data([data_dto])
```

### **After (Orchestrator)**
```python
from opensilex_client import connect

# Simple setup
client = connect()

# Add data
client.add_data_point("http://plot/1", "http://var/height", 25.4)
```

## 🛠️ **Key Features**

### ✅ **Authentication Made Easy**
- ✅ Automatic token saving/loading
- ✅ Token expiration handling  
- ✅ One-line authentication
- ✅ Interactive credential prompts

### ✅ **No More Required Field Errors**
- ✅ Helper functions with proper defaults
- ✅ Built-in validation before API calls
- ✅ Clear error messages when validation fails
- ✅ Smart field auto-completion

### ✅ **High-Level API Operations**
- ✅ Simple methods for all operations
- ✅ Consistent parameter naming
- ✅ Built-in error handling
- ✅ Pagination made simple

### ✅ **Flexible Configuration**
- ✅ Environment variable support
- ✅ Configuration file management
- ✅ Sensible defaults
- ✅ Easy customization

## 📋 **Installation & Setup**

### **1. Install the Client**
```bash
cd opensilex_python_client
pip install -e .
```

### **2. Optional: Configure Environment**
```bash
export OPENSILEX_HOST="http://your-server.com:8666"
export OPENSILEX_LOG_LEVEL="INFO"
export OPENSILEX_PAGE_SIZE=50
```

### **3. Test the Setup**
```bash
python simple_example.py
```

## 🎯 **Common Use Cases**

### **Data Collection**
```python
from opensilex_client import connect
from datetime import datetime

client = connect()

# Single data point
client.add_data_point(
    target="http://opensilex/plot/001",
    variable="http://opensilex/variable/plant_height",
    value=25.4
)

# Multiple data points
data = [
    {'target': 'http://opensilex/plot/001', 'variable': 'http://opensilex/variable/height', 'value': 25.4},
    {'target': 'http://opensilex/plot/002', 'variable': 'http://opensilex/variable/height', 'value': 23.1}
]
client.add_multiple_data(data)

# Time series
client.create_time_series(
    target="http://opensilex/sensor/001",
    variable="http://opensilex/variable/temperature", 
    values_with_dates=[(20.5, datetime.now()), (21.2, datetime.now())]
)
```

### **Experiment Management**
```python
# Create experiment
experiment = client.create_experiment(
    name="Growth Study 2024",
    objective="Study plant growth under different conditions",
    description="12-week controlled study"
)

# List experiments
experiments = client.list_experiments(limit=20)

# Get experiment details
details = client.get_experiment(experiment.result.uri)
```

### **Resource Discovery**
```python
# Find available resources
variables = client.list_variables()
experiments = client.list_experiments()
germplasm = client.list_germplasm()
scientific_objects = client.list_scientific_objects()

# Get ontology information
types = client.get_ontology_types()
```

## 🔧 **Advanced Usage**

### **Custom Authentication Flow**
```python
from utils.auth_manager import OpenSilexAuthManager

auth_manager = OpenSilexAuthManager(host="http://server:8666")
success = auth_manager.authenticate("username", "password")

if success:
    token_info = auth_manager.get_token_info()
    print(f"Token expires: {token_info['expires_at']}")
```

### **Direct API Access**
```python
from utils import quick_auth, create_api_wrapper

auth_manager = quick_auth()
api = create_api_wrapper(auth_manager)

# Access underlying API methods
raw_response = api.experiments_api.search_experiments(page_size=10)
```

### **Model Validation**
```python
from utils.model_helpers import ValidationHelpers, ModelFactory

# Validate before creation
validator = ValidationHelpers()
validator.validate_uri("http://plot/1", "Target")
validator.validate_numeric_value(25.4, "Value")

# Create with validation
factory = ModelFactory(validate=True)
data_point = factory.create_data_point("http://plot/1", "http://var/height", 25.4)
```

## 📊 **Performance & Reliability**

### **Built-in Features**
- 🔄 **Automatic retries** for failed requests
- 📝 **Comprehensive logging** for debugging
- ⚡ **Connection pooling** for performance
- 🛡️ **Input validation** prevents errors
- 💾 **Token persistence** avoids re-authentication

### **Error Handling**
```python
try:
    client.add_data_point(target, variable, value)
except ValueError as e:
    print(f"Validation error: {e}")
except Exception as e:
    print(f"API error: {e}")
```

## 🚨 **Migration Guide**

### **From Raw Client**
```python
# OLD: Raw client usage
auth_dto = opensilex_swagger_client.AuthenticationDTO(identifier="user", password="pass")
response = auth_api.authenticate(auth_dto)

# NEW: Orchestrator
client = connect()  # Handles authentication automatically
```

### **From Manual API Calls**
```python
# OLD: Manual API calls
data_dto = opensilex_swagger_client.DataCreationDTO(target=..., variable=..., _date=..., value=...)
result = data_api.add_list_data([data_dto])

# NEW: Simple method
client.add_data_point(target, variable, value)
```

## 📚 **Documentation**

| File | Purpose |
|------|---------|
| **USAGE_GUIDE.md** | Complete usage documentation |
| **ORCHESTRATOR_README.md** | Detailed orchestrator guide |
| **examples/README.md** | Example scripts documentation |
| **opensilex_python_client/docs/** | Generated API documentation |

## 🎯 **Next Steps**

1. **🚀 Start with the orchestrator**: `python simple_example.py`
2. **📖 Read the usage guide**: Open `USAGE_GUIDE.md`
3. **🔍 Explore examples**: Check the `examples/` directory
4. **🛠️ Customize for your needs**: Modify examples with your URIs
5. **📈 Scale up**: Use utilities for production workflows

## 💡 **Tips for Success**

### **Getting Valid URIs**
```python
# List existing resources to find valid URIs
variables = client.list_variables()
for var in variables.result:
    print(f"Variable URI: {var.uri}")
    
experiments = client.list_experiments()
for exp in experiments.result:
    print(f"Experiment URI: {exp.uri}")
```

### **Debugging Issues**
```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Check client status
status = client.get_status()
print(f"Authentication status: {status}")
```

### **Configuration Management**
```bash
# Create default configuration
python -c "from utils.config import create_default_config; create_default_config()"

# Show current configuration
python opensilex_client.py --config
```

## 🎉 **Success!**

You now have a **production-ready** OpenSilex Python client that's:
- ✅ **Easy to use** - One-line connections and operations
- ✅ **Reliable** - Built-in error handling and validation
- ✅ **Flexible** - Multiple usage patterns for different needs
- ✅ **Well-documented** - Complete guides and examples
- ✅ **Future-proof** - Extensible architecture

**Start with `python simple_example.py` and see how easy OpenSilex can be!** 🚀