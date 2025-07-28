# OpenSilex Data Import Scripts

This directory contains specialized scripts for importing data from various sources into OpenSilex using the API.

## 📁 **Available Import Scripts**

| Script | Purpose | Data Sources |
|--------|---------|--------------|
| **`csv_data_importer.py`** | Import from CSV files | Excel exports, sensor logs, measurement data |
| **`json_data_importer.py`** | Import from JSON files | API responses, IoT data, structured exports |
| **`database_importer.py`** | Import from databases | SQL Server, MySQL, PostgreSQL, SQLite, Oracle |
| **`sensor_data_importer.py`** | Import sensor data | Real-time APIs, sensor logs, IoT platforms |

## 🚀 **Quick Start**

### **1. Install Dependencies**
```bash
# Core dependencies (already installed with OpenSilex client)
pip install pandas sqlalchemy

# Additional database drivers (install as needed)
pip install pymysql          # MySQL
pip install psycopg2        # PostgreSQL
pip install pyodbc          # SQL Server
pip install cx_Oracle       # Oracle
```

### **2. Create Sample Data**
```bash
# Generate sample CSV data
python csv_data_importer.py --create-sample

# Generate sample JSON data
python json_data_importer.py --create-samples

# Generate sample database
python database_importer.py --create-sample

# Generate sample sensor data
python sensor_data_importer.py --create-samples
```

### **3. Test Import (Dry Run)**
```bash
# Test CSV import without actually importing
python csv_data_importer.py sample_data.csv --dry-run

# Test JSON import
python json_data_importer.py sample_simple.json --dry-run

# Test database import
python database_importer.py --table measurements --dry-run
```

## 📊 **CSV Data Import**

### **Basic Usage**
```bash
# Import CSV with default mapping
python csv_data_importer.py your_data.csv

# Import with custom settings
python csv_data_importer.py your_data.csv --batch-size 50 --date-format "%d/%m/%Y %H:%M"
```

### **Column Mapping**
The script needs to know how your CSV columns map to OpenSilex fields. Edit the `column_mapping` in the script:

```python
column_mapping = {
    'plot_id': 'target',           # Your column -> OpenSilex field
    'trait_name': 'variable',      # Variable/trait column
    'measurement': 'value',        # Measurement value column
    'date_time': 'date',          # Timestamp column
    'confidence': 'confidence'     # Quality/confidence column (optional)
}
```

### **Get Column Suggestions**
```bash
# Analyze your CSV and get mapping suggestions
python csv_data_importer.py your_data.csv --suggest-mapping
```

### **CSV Format Requirements**
- **Target**: URI of the measured object (plot, plant, device, etc.)
- **Variable**: URI of the measured trait/variable
- **Value**: Numeric measurement value
- **Date**: Timestamp (various formats supported)
- **Confidence**: Optional quality score (0-1)

## 📋 **JSON Data Import**

### **Basic Usage**
```bash
# Import simple JSON array
python json_data_importer.py data.json

# Import nested JSON structure
python json_data_importer.py nested_data.json --data-path "measurements.data"
```

### **Analyze JSON Structure**
```bash
# Get structure analysis and mapping suggestions
python json_data_importer.py your_data.json --analyze
```

### **Field Mapping Example**
```python
# For nested JSON structures
field_mapping = {
    'plot_id': 'target',
    'trait': 'variable', 
    'measurement': 'value',
    'timestamp': 'date',
    'quality': 'confidence'
}
```

### **Supported JSON Formats**
1. **Simple array**: `[{target, variable, value, date}, ...]`
2. **Nested structure**: `{experiment: {data: [{...}]}}`
3. **API response**: `{status: "ok", measurements: [{...}]}`

## 💾 **Database Import**

### **Basic Usage**
```bash
# Import from table
python database_importer.py --table measurements

# Import with custom query
python database_importer.py --query "SELECT * FROM sensor_data WHERE date >= '2024-01-01'"

# Import from different database types
python database_importer.py --db-type mysql --host localhost --database mydb --username user --password pass --table data
```

### **Connection Examples**
```bash
# SQLite (default)
python database_importer.py --database /path/to/data.db --table measurements

# MySQL
python database_importer.py --db-type mysql --host server --database opensilex_data --username myuser --password mypass --table sensor_readings

# PostgreSQL
python database_importer.py --db-type postgresql --host server --port 5432 --database research_db --username analyst --table experiment_data

# SQL Server
python database_importer.py --db-type sqlserver --host server --database ResearchDB --username domain\\user --password pass --table MeasurementData
```

### **Show Database Tables**
```bash
# See what tables and columns are available
python database_importer.py --show-tables
```

## 📡 **Sensor Data Import**

### **Log File Import**
```bash
# Import from sensor log file
python sensor_data_importer.py --log-file sensor_data.csv --mappings sensor_mappings.json

# Different log formats
python sensor_data_importer.py --log-file data.json --sensor-format json --mappings mappings.json
```

### **Real-Time Import**
```bash
# Import real-time data from API
python sensor_data_importer.py --real-time --api-endpoint http://sensors.example.com/api/current --mappings mappings.json

# Run for specific duration
python sensor_data_importer.py --real-time --api-endpoint http://api.example.com/sensors --duration-minutes 60 --polling-interval 30
```

### **Sensor Mapping File**
Create a JSON file mapping sensor IDs to OpenSilex URIs:

```json
{
  "temp_sensor_01": {
    "target_uri": "http://opensilex.dev/greenhouse/001",
    "variable_uri": "http://opensilex.dev/variable/air_temperature",
    "confidence": 0.95
  },
  "humidity_01": {
    "target_uri": "http://opensilex.dev/greenhouse/001", 
    "variable_uri": "http://opensilex.dev/variable/relative_humidity",
    "confidence": 0.90
  }
}
```

## 🔧 **Common Workflow**

### **1. Discovery Phase**
```bash
# Connect to OpenSilex and see what's available
python -c "
from opensilex_client import connect
client = connect()

# Get valid URIs for your data
variables = client.list_variables(limit=20)
for var in variables.result:
    print(f'Variable: {var.name} -> {var.uri}')

experiments = client.list_experiments(limit=10)  
for exp in experiments.result:
    print(f'Experiment: {exp.name} -> {exp.uri}')

objects = client.list_scientific_objects(limit=10)
for obj in objects.result:
    print(f'Object: {getattr(obj, \"name\", \"No name\")} -> {obj.uri}')
"
```

### **2. Mapping Phase**
- Analyze your data structure
- Map your data fields to OpenSilex URIs
- Create mapping configurations
- Test with dry runs

### **3. Import Phase**
```bash
# Start with small batches
python your_importer.py --batch-size 10 --dry-run

# Then import for real
python your_importer.py --batch-size 100

# Monitor for errors and adjust
```

## ⚠️ **Important Notes**

### **URI Requirements**
- **All URIs must exist** in your OpenSilex instance
- Use `client.list_*()` methods to find valid URIs
- Target URIs: Scientific objects, plots, devices, etc.
- Variable URIs: Traits, measurements, sensor parameters

### **Data Validation**
- All scripts include built-in validation
- Required fields: target, variable, value, date
- Value must be numeric (or convertible to numeric)
- Dates are automatically parsed from various formats

### **Performance Tips**
- Use appropriate batch sizes (100-1000 records)
- Monitor memory usage for large imports
- Use dry runs to test before importing
- Consider importing during off-peak hours

### **Error Handling**
- All scripts log errors with details
- Failed records are skipped, successful ones are imported
- Check error logs to fix data issues
- Re-run imports to catch previously failed records

## 📈 **Example Workflows**

### **Excel Data Import**
```bash
# 1. Export Excel to CSV
# 2. Analyze CSV structure
python csv_data_importer.py data.csv --suggest-mapping

# 3. Update column mapping in script
# 4. Test import
python csv_data_importer.py data.csv --dry-run

# 5. Import for real
python csv_data_importer.py data.csv
```

### **IoT Sensor Integration**
```bash
# 1. Create sensor mappings
python sensor_data_importer.py --create-samples

# 2. Edit sensor_mappings.json with your URIs
# 3. Test with historical data
python sensor_data_importer.py --log-file sensor_history.csv --mappings sensor_mappings.json --dry-run

# 4. Start real-time import
python sensor_data_importer.py --real-time --api-endpoint http://your-iot-api.com/current --mappings sensor_mappings.json
```

### **Database Migration**
```bash
# 1. Analyze source database
python database_importer.py --show-tables

# 2. Test specific table
python database_importer.py --table your_table --dry-run

# 3. Import with custom query
python database_importer.py --query "SELECT target_id, trait_id, value, measured_at FROM measurements WHERE date >= '2024-01-01'" 
```

## 🆘 **Troubleshooting**

### **Authentication Issues**
```bash
# Test connection first
python -c "from opensilex_client import connect; client = connect(); print(client.get_status())"
```

### **URI Not Found Errors**
```bash
# Check if URIs exist in OpenSilex
python -c "
from opensilex_client import connect
client = connect()
try:
    # Test if URI exists by searching
    variables = client.list_variables()
    print('Available variable URIs:')
    for var in variables.result[:10]:
        print(f'  {var.uri}')
except Exception as e:
    print(f'Error: {e}')
"
```

### **Data Format Issues**
- Check date formats match your data
- Ensure numeric values are clean (no text, special characters)
- Verify column names match your mapping
- Use `--dry-run` to test before importing

### **Performance Issues**
- Reduce batch size for large records
- Import during off-peak hours
- Monitor server resources
- Consider splitting large imports into chunks

The import scripts are designed to be robust and handle most common data import scenarios. Start with the sample data generation, then adapt the column mappings to match your specific data structure.