# OpenSilex Python Client Examples

This directory contains example scripts demonstrating how to use the OpenSilex Python client utilities.

## Examples Overview

### 1. `basic_usage.py`
**Purpose**: Introduction to the utility classes and basic operations.

**What it demonstrates**:
- Authentication with saved token management
- API wrapper setup
- System information retrieval
- Listing experiments and variables
- Creating model objects (without submission)

**Run with**: `python examples/basic_usage.py`

### 2. `data_management.py`
**Purpose**: Comprehensive data operations including search, creation, and validation.

**What it demonstrates**:
- Searching for existing data with date filters
- Creating individual data points
- Bulk data operations and time series
- Data validation techniques
- Advanced data creation with confidence levels

**Run with**: `python examples/data_management.py`

### 3. `experiment_management.py`
**Purpose**: Complete experiment lifecycle management.

**What it demonstrates**:
- Listing and retrieving existing experiments
- Creating simple and detailed experiments
- Experiment timeline planning
- Validation of experiment data
- Planning multiple related experiments

**Run with**: `python examples/experiment_management.py`

## Prerequisites

1. **Install the OpenSilex client**:
   ```bash
   cd opensilex_python_client
   pip install -e .
   ```

2. **Configure your server**:
   - Update the host URL in the examples or set the `OPENSILEX_HOST` environment variable
   - Have valid credentials ready for authentication

3. **Python dependencies**:
   All required dependencies are included with the OpenSilex client installation.

## Usage Patterns

### Quick Start
```python
from utils import quick_auth, create_api_wrapper

# Authenticate (will prompt for credentials if needed)
auth_manager = quick_auth()

# Create API wrapper
api = create_api_wrapper(auth_manager)

# Use the API
experiments = api.list_experiments()
```

### Data Creation
```python
from utils import quick_data_point
from datetime import datetime

# Create a data point
data = quick_data_point(
    target="http://your-server.com/plot/001",
    variable="http://your-server.com/variable/height",
    value=25.4,
    date=datetime.now()
)

# Submit it
api.add_data("http://your-server.com/plot/001", 
            "http://your-server.com/variable/height",
            datetime.now(), 25.4)
```

### Experiment Creation
```python
from utils import quick_experiment
from datetime import datetime

# Create an experiment
experiment = quick_experiment(
    name="My Test Experiment",
    objective="Testing the API utilities"
)

# Submit it
api.create_experiment(
    name="My Test Experiment",
    start_date=datetime.now(),
    objective="Testing the API utilities"
)
```

## Important Notes

### URIs and Real Data
- The examples use placeholder URIs like `http://example.com/...`
- **Replace these with real URIs from your OpenSilex instance**
- You can find valid URIs by:
  - Using the list methods (e.g., `api.list_variables()`)
  - Checking your OpenSilex web interface
  - Using the ontology methods

### Authentication
- The utilities automatically handle token saving/loading
- Tokens are saved in `~/.opensilex_token.json`
- You can log out using `auth_manager.logout()`

### Error Handling
- All examples include error handling for common issues
- Network errors, authentication failures, and validation errors are caught
- Check the console output for detailed error information

### Validation
- The utilities include comprehensive data validation
- Use `ModelFactory(validate=True)` for strict validation
- Validation catches common issues before API submission

## Customization

### Adding New Examples
1. Create a new Python file in the `examples/` directory
2. Follow the same structure as existing examples:
   - Import utilities from the parent `utils` package
   - Use proper error handling
   - Include explanatory output
   - Document what the example demonstrates

### Modifying for Your Use Case
1. Update server URLs and authentication details
2. Replace example URIs with real ones from your system
3. Modify data structures to match your variables and experiments
4. Add your specific validation rules

## Troubleshooting

### Common Issues

1. **Import Errors**:
   - Make sure you're running from the project root directory
   - Check that the OpenSilex client is installed: `pip install -e ./opensilex_python_client`

2. **Authentication Failures**:
   - Verify your username and password
   - Check that the server URL is correct
   - Ensure the server is accessible from your network

3. **API Errors (404, 500, etc.)**:
   - Verify the server is running and accessible
   - Check that your authentication token is valid
   - Ensure you're using correct URIs for your OpenSilex instance

4. **Model Creation Errors**:
   - Check that all required fields are provided
   - Use the validation helpers to identify missing or invalid data
   - Refer to the OpenSilex API documentation for field requirements

### Getting Help

1. Check the console output for detailed error messages
2. Enable debug logging: `logging.basicConfig(level=logging.DEBUG)`
3. Review the OpenSilex API documentation
4. Check the generated client documentation in the `docs/` folder

## Next Steps

After running these examples:

1. **Explore the API wrapper**: Check `utils/api_wrapper.py` for all available methods
2. **Create your own scripts**: Use these examples as templates for your specific use cases
3. **Integrate with your workflow**: Adapt the utilities for your data collection and experiment management needs
4. **Contribute improvements**: If you create useful utilities or examples, consider sharing them

## File Structure

```
examples/
├── README.md                 # This file
├── basic_usage.py           # Basic introduction example
├── data_management.py       # Data operations example  
└── experiment_management.py # Experiment management example
```