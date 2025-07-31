# OpenSilex Client Orchestrator

## 🚀 **One File to Rule Them All**

The `opensilex_client.py` file provides a **single, unified interface** for all OpenSilex operations. Instead of dealing with multiple utility classes, authentication management, and complex model creation, you get everything in one simple API.

## ⚡ **Quick Start**

### Ultra-Simple Usage:
```python
from opensilex_client import connect

# One line to connect and authenticate
client = connect()

# Now you can do everything:
experiments = client.list_experiments()
client.add_data_point("http://plot/1", "http://var/height", 25.4)
client.create_experiment("My Test", "Testing the API")
```

### Complete Example:
```python
from opensilex_client import connect
from datetime import datetime

# Connect
client = connect(host="http://your-server.com:8666")

# Check status
status = client.get_status()
print(f"Connected as: {status['username']}")

# Add some data
client.add_data_point(
    target="http://example.com/plot/1",
    variable="http://example.com/variable/height", 
    value=25.4,
    date=datetime.now()
)

# Create an experiment
experiment = client.create_experiment(
    name="Growth Study",
    objective="Study plant growth rates",
    description="6-week study of different conditions"
)

# Search for data
data = client.search_data(
    start_date="2024-01-01", 
    end_date="2024-12-31",
    limit=100
)

print(f"Found {len(data)} data points")
```

## 🎯 **Key Features**

### 1. **Zero Configuration**
- Automatic authentication with token persistence
- Smart defaults for everything
- Environment variable support
- One-line connection

### 2. **Unified API**
- All operations through one client object
- Consistent method signatures
- Built-in validation and error handling
- No need to understand the underlying complexity

### 3. **Smart Defaults**
- Auto-fills dates, confidence levels, and other common fields
- Intelligent parameter handling
- Configuration-driven behavior

### 4. **Error Prevention**
- Built-in validation before API calls
- Clear error messages
- Automatic retry and connection management

## 📋 **Available Methods**

### **Connection & Status**
```python
client = connect()                    # Connect with authentication
status = client.get_status()          # Get client and server status
client.logout()                       # Logout and cleanup
```

### **Data Operations**
```python
# Add single data point
client.add_data_point(target, variable, value, date=None, confidence=None)

# Add multiple data points
client.add_multiple_data([{target, variable, value, date, confidence}, ...])

# Search data
client.search_data(target=None, variable=None, start_date=None, end_date=None, limit=None)

# Create time series
client.create_time_series(target, variable, [(value1, date1), (value2, date2), ...])

# Validate data before submission
client.validate_data_point(target, variable, value)
```

### **Experiment Operations**
```python
# Create experiment
client.create_experiment(name, objective, start_date=None, end_date=None, description=None)

# List experiments
client.list_experiments(limit=None)

# Get experiment details
client.get_experiment(experiment_uri)
```

### **Germplasm Operations**
```python
# Create germplasm
client.create_germplasm(name, species=None, variety=None)

# List germplasm
client.list_germplasm(limit=None)

# Get germplasm details
client.get_germplasm(germplasm_uri)
```

### **Variable Operations**
```python
# Create variable
client.create_variable(name, alternative_name, description, characteristic, method, unit, entity, datatype="decimal")

# List variables
client.list_variables(limit=None)

# Get variable details
client.get_variable(variable_uri)
```

### **Scientific Objects**
```python
# List scientific objects
client.list_scientific_objects(experiment=None, limit=None)

# Get scientific object details
client.get_scientific_object(so_uri)
```

### **Ontology & Utilities**
```python
# Get ontology types
client.get_ontology_types(parent_type=None)

# Check if client is ready
client.is_ready()
```

## 🛠 **Configuration**

### **Environment Variables**
```bash
export OPENSILEX_HOST="http://your-server.com:8666"
export OPENSILEX_PAGE_SIZE=100
export OPENSILEX_LOG_LEVEL=DEBUG
```

### **Programmatic Configuration**
```python
client = connect(
    host="http://your-server.com:8666",
    username="your_user", 
    password="your_pass"
)
```

### **Configuration File**
The client uses `~/.opensilex_config.json` for persistent settings.

## 📱 **Command Line Interface**

The orchestrator also works as a CLI tool:

```bash
# Show status
python opensilex_client.py --status

# List experiments
python opensilex_client.py --list-experiments

# List variables  
python opensilex_client.py --list-variables

# Show configuration
python opensilex_client.py --config
```

## 🔄 **Migration from Utilities**

### **Before (using utilities separately):**
```python
from utils import quick_auth, create_api_wrapper, quick_data_point

# Multi-step setup
auth_manager = quick_auth()
api = create_api_wrapper(auth_manager)

# Complex model creation
data_point = quick_data_point(target, variable, value, date)
result = api.add_data(target, variable, date, value)
```

### **After (using orchestrator):**
```python
from opensilex_client import connect

# One-step setup
client = connect()

# Simple operation
client.add_data_point(target, variable, value)
```

## 🎯 **Why Use the Orchestrator?**

### **Comparison:**

| Aspect | Individual Utils | Orchestrator |
|--------|------------------|--------------|
| **Setup** | 3-4 imports, multiple objects | 1 import, 1 object |
| **Authentication** | Manual token management | Automatic |
| **API Calls** | Wrapper + model creation | Direct methods |
| **Error Handling** | Manual validation | Built-in |
| **Configuration** | Manual setup | Automatic defaults |
| **Learning Curve** | Steep (multiple classes) | Gentle (one interface) |

### **Perfect For:**
- ✅ **Beginners** - Single interface to learn
- ✅ **Quick scripts** - Minimal boilerplate code  
- ✅ **Prototyping** - Fast iteration and testing
- ✅ **Production code** - All utilities still available underneath
- ✅ **Data scientists** - Focus on data, not API complexity

### **When to Use Utils Directly:**
- 🔧 **Advanced customization** - Need specific authentication flows
- 🔧 **Performance optimization** - Fine-tuned control over API calls
- 🔧 **Complex integrations** - Building your own abstractions

## 📁 **File Structure**

```
your_project/
├── opensilex_client.py          # 👑 THE ORCHESTRATOR
├── simple_example.py            # Quick start example
├── utils/                       # Underlying utilities (still available)
│   ├── auth_manager.py
│   ├── api_wrapper.py  
│   ├── model_helpers.py
│   └── config.py
└── examples/                    # Detailed examples
    ├── basic_usage.py
    ├── data_management.py
    └── experiment_management.py
```

## 🚀 **Get Started Now**

1. **Install the OpenSilex client**:
   ```bash
   cd opensilex_python_client
   pip install -e .
   ```

2. **Run the simple example**:
   ```bash
   python simple_example.py
   ```

3. **Start using in your code**:
   ```python
   from opensilex_client import connect
   client = connect()
   # You're ready to go!
   ```

The orchestrator makes OpenSilex as easy to use as any modern Python library, while keeping all the power and flexibility of the underlying utilities available when you need them.