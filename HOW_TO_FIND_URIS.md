# How to Find Real URIs in OpenSilex

There are **3 ways** to find the real URIs you need for data import:

## 🚀 **Method 1: Automated Discovery Script (Recommended)**

Run the automated URI discovery script:

```bash
python find_real_uris.py
```

**What it does:**
- ✅ Connects to your OpenSilex server (98.71.237.204:8666)
- ✅ Authenticates with your credentials
- ✅ Discovers ALL available URIs automatically
- ✅ Creates reference files with examples
- ✅ Shows you exactly what URIs to use

**Output files:**
- `opensilex_uris.json` - Complete URI data (machine readable)
- `URI_REFERENCE.md` - Human readable reference with examples

## 🌐 **Method 2: Web Interface (Manual)**

1. **Open your OpenSilex web interface:**
   ```
   http://98.71.237.204:8666
   ```

2. **Login with your credentials**

3. **Navigate to find URIs:**

### **Variables (What you can measure):**
- Go to: **Variables** → **Variable List**
- Look for the **URI column** in the table
- Copy URIs like: `http://opensilex.org/variable/plant_height`

### **Scientific Objects (What you measure on):**
- Go to: **Experiments** → **[Your Experiment]** → **Scientific Objects**
- Or: **Scientific Objects** (in main menu)
- Look for the **URI column**
- Copy URIs like: `http://opensilex.org/plot/plot001`

### **Experiments:**
- Go to: **Experiments** → **Experiment List**
- Click on an experiment to see its URI
- Copy URIs like: `http://opensilex.org/experiment/demo2024`

## 💻 **Method 3: Quick Command Line**

If you just want a quick list:

```bash
python -c "
from opensilex_client import connect
client = connect(host='http://98.71.237.204:8666')

print('=== VARIABLES ===')
vars = client.list_variables(limit=10)
for v in vars.result:
    print(f'{v.name}: {v.uri}')

print('\n=== SCIENTIFIC OBJECTS ===')  
objs = client.list_scientific_objects(limit=10)
for o in objs.result:
    print(f'{getattr(o, \"name\", \"No name\")}: {o.uri}')
"
```

## 🎯 **What You're Looking For**

For data import, you need **2 main types of URIs**:

### **1. TARGET URIs** (What you're measuring)
These are the objects/subjects of your measurements:
- **Plots**: `http://opensilex.org/plot/plot001`
- **Plants**: `http://opensilex.org/plant/plant123`
- **Devices**: `http://opensilex.org/device/sensor01`
- **Greenhouses**: `http://opensilex.org/greenhouse/gh1`

### **2. VARIABLE URIs** (What measurement/trait)
These define what you're measuring:
- **Plant height**: `http://opensilex.org/variable/plant_height`
- **Temperature**: `http://opensilex.org/variable/air_temperature`
- **Humidity**: `http://opensilex.org/variable/relative_humidity`
- **Leaf count**: `http://opensilex.org/variable/leaf_number`

## 📊 **Example Usage**

Once you have real URIs, use them in your data:

### **CSV Example:**
```csv
target_uri,variable_uri,value,date,confidence
http://opensilex.org/plot/plot001,http://opensilex.org/variable/plant_height,25.4,2024-01-15 10:00:00,0.95
http://opensilex.org/plot/plot002,http://opensilex.org/variable/plant_height,23.1,2024-01-15 10:00:00,0.90
```

### **JSON Example:**
```json
{
  "measurements": [
    {
      "target": "http://opensilex.org/plot/plot001",
      "variable": "http://opensilex.org/variable/plant_height",
      "value": 25.4,
      "date": "2024-01-15T10:00:00",
      "confidence": 0.95
    }
  ]
}
```

### **Python API Example:**
```python
from opensilex_client import connect
client = connect()

client.add_data_point(
    target="http://opensilex.org/plot/plot001",
    variable="http://opensilex.org/variable/plant_height",
    value=25.4
)
```

## ⚠️ **What if No URIs are Found?**

If the discovery script finds no variables or scientific objects, your OpenSilex might be empty. You need to:

### **Create Variables First:**
1. Go to web interface: `http://98.71.237.204:8666`
2. Navigate to **Variables** → **Add Variable**
3. Create variables for your measurements (height, temperature, etc.)

### **Create Scientific Objects:**
1. Go to **Experiments** → **[Create or Select Experiment]**
2. Add **Scientific Objects** (plots, plants, devices)
3. Or use **Scientific Objects** menu directly

### **Create Experiments:**
1. Go to **Experiments** → **Add Experiment**
2. Set up your experimental design
3. Add factors, treatments, etc.

## 📋 **URI Format Examples**

OpenSilex URIs typically follow these patterns:

```
# Variables (traits/measurements)
http://[your-server]/variable/[variable-name]
http://opensilex.org/variable/plant_height
http://opensilex.org/variable/air_temperature

# Scientific Objects (targets)
http://[your-server]/[object-type]/[object-id]
http://opensilex.org/plot/plot001
http://opensilex.org/plant/plant123
http://opensilex.org/device/sensor01

# Experiments
http://[your-server]/experiment/[experiment-id]
http://opensilex.org/experiment/growth_study_2024
```

## 🎯 **Recommended Workflow**

1. **Run the discovery script**: `python find_real_uris.py`
2. **Check the generated files**: `URI_REFERENCE.md`
3. **If empty, create resources** in the web interface first
4. **Use the real URIs** in your import data
5. **Test with small data first**: Use `--dry-run` flag
6. **Import your full dataset**

The discovery script is the fastest and most reliable way to get all your URIs in one go!