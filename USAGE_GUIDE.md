# OpenSilex Python Client - Complete Usage Guide

## 🎯 **Choose Your Approach**

You now have **two ways** to use the OpenSilex Python client:

### 1. **🚀 RECOMMENDED: Use the Orchestrator** (Easiest)
- **File**: `opensilex_client.py`
- **Best for**: Quick scripts, beginners, most use cases
- **One line to get started**: `client = connect()`

### 2. **🔧 Advanced: Use Individual Utilities** (Most flexible)
- **Files**: `utils/` directory
- **Best for**: Complex integrations, custom authentication flows
- **More control**: Individual classes for each component

---

## 📋 **Quick Reference**

### **Super Quick Start (Orchestrator)**
```python
from opensilex_client import connect

# Connect and authenticate in one line
client = connect()

# Add data
client.add_data_point("http://plot/1", "http://var/height", 25.4)

# Create experiment
client.create_experiment("Test", "Testing the API")

# List resources
experiments = client.list_experiments()
variables = client.list_variables()
```

### **Individual Utilities Approach**
```python
from utils import quick_auth, create_api_wrapper, quick_data_point

# Multi-step setup
auth_manager = quick_auth()
api = create_api_wrapper(auth_manager)

# Create models and submit
data_point = quick_data_point("http://plot/1", "http://var/height", 25.4)
result = api.add_data("http://plot/1", "http://var/height", datetime.now(), 25.4)
```

---

## 🚀 **Method 1: Orchestrator (Recommended)**

### **Installation & Setup**
```bash
# 1. Install the client
cd opensilex_python_client
pip install -e .

# 2. Optional: Set environment variables
export OPENSILEX_HOST="http://your-server.com:8666"
export OPENSILEX_LOG_LEVEL="INFO"
```

### **Basic Usage**
```python
from opensilex_client import connect
from datetime import datetime

# Connect (will prompt for credentials first time)
client = connect()

# Check status
status = client.get_status()
print(f"Connected as: {status.get('username')}")
print(f"Server: {status.get('server_host')}")
print(f"Authenticated: {status.get('authenticated')}")
```

### **Working with Data**
```python
# Add a single data point
client.add_data_point(
    target="http://opensilex.dev/plot001",
    variable="http://opensilex.dev/variable/plant_height",
    value=25.4,
    date=datetime.now(),
    confidence=0.95
)

# Add multiple data points
data_points = [
    {
        'target': 'http://opensilex.dev/plot001',
        'variable': 'http://opensilex.dev/variable/plant_height',
        'value': 25.4,
        'date': datetime.now()
    },
    {
        'target': 'http://opensilex.dev/plot002',
        'variable': 'http://opensilex.dev/variable/plant_height', 
        'value': 23.1,
        'date': datetime.now()
    }
]
client.add_multiple_data(data_points)

# Search for data
data_results = client.search_data(
    start_date="2024-01-01T00:00:00Z",
    end_date="2024-12-31T23:59:59Z",
    target="http://opensilex.dev/plot001",
    limit=100
)
```

### **Working with Experiments**
```python
# Create an experiment
experiment = client.create_experiment(
    name="Plant Growth Study 2024",
    objective="Study effect of light conditions on plant growth",
    description="8-week controlled study with LED lighting",
    start_date=datetime.now()
)

# List experiments
experiments = client.list_experiments(limit=20)
for exp in experiments.result:
    print(f"- {exp.name} (Started: {exp.start_date})")

# Get experiment details
if experiments.result:
    first_exp_uri = experiments.result[0].uri
    details = client.get_experiment(first_exp_uri)
    print(f"Experiment details: {details.result.description}")
```

### **Working with Variables**
```python
# List variables
variables = client.list_variables(limit=10)
for var in variables.result:
    print(f"- {var.name}: {getattr(var, 'description', 'No description')}")

# Create a variable (requires all URIs)
new_variable = client.create_variable(
    name="Leaf Area Index",
    alternative_name="LAI",
    description="Measure of leaf area per unit ground area",
    characteristic="http://opensilex.dev/characteristic/leaf_area",
    method="http://opensilex.dev/method/optical_measurement",
    unit="http://opensilex.dev/unit/dimensionless",
    entity="http://opensilex.dev/entity/plant",
    datatype="decimal"
)
```

### **Command Line Usage**
```bash
# Show client status
python opensilex_client.py --status

# List experiments
python opensilex_client.py --list-experiments

# List variables
python opensilex_client.py --list-variables

# Show configuration
python opensilex_client.py --config
```

---

## 🔧 **Method 2: Individual Utilities (Advanced)**

### **Authentication Management**
```python
from utils.auth_manager import OpenSilexAuthManager, quick_auth

# Method 1: Quick authentication (interactive)
auth_manager = quick_auth()

# Method 2: Programmatic authentication
auth_manager = OpenSilexAuthManager(host="http://your-server.com:8666")
success = auth_manager.authenticate("username", "password")

# Check authentication status
if auth_manager.is_authenticated():
    print("Ready to make API calls")
    
# Get token information
token_info = auth_manager.get_token_info()
print(f"Token expires: {token_info['expires_at']}")
```

### **API Wrapper Usage**
```python
from utils.api_wrapper import create_api_wrapper

# Create API wrapper (requires authenticated auth_manager)
api = create_api_wrapper(auth_manager)

# Use specific API methods
experiments = api.list_experiments(limit=10, offset=0)
data_results = api.search_data(
    start_date="2024-01-01",
    end_date="2024-12-31",
    limit=50
)

# Create resources
new_exp = api.create_experiment(
    name="Test Experiment",
    start_date=datetime.now(),
    objective="Testing API wrapper"
)
```

### **Model Helpers**
```python
from utils.model_helpers import ModelFactory, quick_data_point, ValidationHelpers

# Quick model creation
data_point = quick_data_point(
    target="http://plot/1",
    variable="http://var/height",
    value=25.4
)

# Advanced model creation with validation
factory = ModelFactory(validate=True)
validated_data = factory.create_data_point(
    target="http://plot/1",
    variable="http://var/height", 
    value=25.4,
    confidence=0.95
)

# Manual validation
validator = ValidationHelpers()
validator.validate_uri("http://plot/1", "Target")
validator.validate_numeric_value(25.4, "Height")
validator.validate_confidence(0.95)
```

### **Configuration Management**
```python
from utils.config import get_config, create_default_config

# Get configuration
config = get_config()

# Access configuration values
server_host = config.get('server', 'host')
page_size = config.get('api', 'default_page_size')

# Modify configuration
config.set('server', 'host', 'http://new-server.com:8666')
config.save()

# Create default config file
create_default_config('my_config.json')
```

---

## 📊 **Comparison: When to Use What**

| Use Case | Orchestrator | Individual Utils |
|----------|--------------|------------------|
| **Quick scripts** | ✅ Perfect | ❌ Overkill |
| **Learning OpenSilex** | ✅ Easier | ❌ Complex |
| **Production apps** | ✅ Good | ✅ Better control |
| **Custom auth flows** | ❌ Limited | ✅ Full control |
| **Batch processing** | ✅ Simple | ✅ Optimizable |
| **Integration with other systems** | ✅ Good | ✅ Better |
| **Error handling customization** | ❌ Basic | ✅ Full control |
| **Performance optimization** | ❌ Standard | ✅ Fine-tunable |

---

## 🛠 **Configuration Options**

### **Environment Variables**
```bash
# Server configuration
export OPENSILEX_HOST="http://your-server.com:8666"
export OPENSILEX_TIMEOUT=30
export OPENSILEX_VERIFY_SSL=true

# Authentication
export OPENSILEX_TOKEN_FILE="~/.my_opensilex_token.json"

# API settings
export OPENSILEX_PAGE_SIZE=100
export OPENSILEX_LOG_LEVEL=DEBUG
```

### **Configuration File** (`~/.opensilex_config.json`)
```json
{
  "server": {
    "host": "http://your-server.com:8666",
    "timeout": 30,
    "verify_ssl": true
  },
  "auth": {
    "token_file": "~/.opensilex_token.json",
    "auto_refresh": true
  },
  "api": {
    "default_page_size": 50,
    "max_retries": 3
  },
  "logging": {
    "level": "INFO"
  }
}
```

---

## 🚨 **Common Issues & Solutions**

### **Authentication Issues**
```python
# Problem: Authentication fails
# Solution: Check credentials and server URL
client = connect(host="http://correct-server.com:8666")

# Problem: Token expired
# Solution: Logout and re-authenticate
client.logout()
client.authenticate("username", "password")
```

### **API Errors**
```python
# Problem: 404 errors
# Solution: Verify URIs exist in your OpenSilex instance
variables = client.list_variables()
for var in variables.result:
    print(f"Valid variable URI: {var.uri}")

# Problem: Required field errors
# Solution: Use validation before submission
try:
    client.validate_data_point(target, variable, value)
    client.add_data_point(target, variable, value)
except ValueError as e:
    print(f"Validation error: {e}")
```

### **Import Errors**
```python
# Problem: Cannot import utils
# Solution: Make sure you're in the right directory
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from opensilex_client import connect
```

---

## 📚 **Complete Examples**

### **Example 1: Data Collection Script**
```python
from opensilex_client import connect
from datetime import datetime, timedelta
import random

# Connect
client = connect()

# Simulate sensor data collection
def collect_sensor_data():
    base_time = datetime.now() - timedelta(hours=24)
    
    for hour in range(24):
        timestamp = base_time + timedelta(hours=hour)
        temperature = 20 + random.uniform(-5, 10)  # Simulate temperature
        humidity = 60 + random.uniform(-20, 30)    # Simulate humidity
        
        # Add temperature data
        client.add_data_point(
            target="http://opensilex.dev/greenhouse/001",
            variable="http://opensilex.dev/variable/air_temperature",
            value=round(temperature, 1),
            date=timestamp,
            confidence=0.95
        )
        
        # Add humidity data
        client.add_data_point(
            target="http://opensilex.dev/greenhouse/001", 
            variable="http://opensilex.dev/variable/relative_humidity",
            value=round(humidity, 1),
            date=timestamp,
            confidence=0.90
        )
    
    print("✓ 24 hours of sensor data collected")

# Run data collection
collect_sensor_data()
```

### **Example 2: Experiment Setup**
```python
from opensilex_client import connect
from datetime import datetime, timedelta

client = connect()

def setup_growth_experiment():
    # Create the main experiment
    experiment = client.create_experiment(
        name="LED Light Spectrum Study 2024",
        objective="Compare plant growth under different LED light spectra",
        description="12-week study comparing red, blue, and full-spectrum LED effects on lettuce growth",
        start_date=datetime.now(),
        end_date=datetime.now() + timedelta(weeks=12)
    )
    
    print(f"✓ Created experiment: {experiment.result.uri}")
    
    # Create germplasm for the study
    germplasm = client.create_germplasm(
        name="Buttercrunch Lettuce - Batch 2024A",
        species="http://opensilex.dev/species/lactuca_sativa",
        variety="Buttercrunch"
    )
    
    print(f"✓ Created germplasm: {germplasm.result.uri}")
    
    return experiment.result.uri, germplasm.result.uri

# Setup experiment
exp_uri, germplasm_uri = setup_growth_experiment()
```

---

## 🎯 **Next Steps**

1. **Choose your approach** - Orchestrator for simplicity, utilities for control
2. **Run the examples** - Start with `simple_example.py`
3. **Get your URIs** - List existing resources to find valid URIs
4. **Replace examples** - Update example URIs with real ones from your system
5. **Build your workflow** - Create scripts for your specific use cases

The OpenSilex Python client is now as easy to use as any modern Python library while keeping all the power and flexibility you need for complex scientific data management!