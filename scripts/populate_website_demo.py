#!/usr/bin/env python3
"""
Populate OpenSilex Website with Demo Data

This script creates and imports demonstration data to fill up your OpenSilex website
with realistic scientific content for testing and demonstration purposes.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import json
from datetime import datetime, timedelta
import random
import math

def create_extensive_demo_data():
    """Create extensive demonstration data for website population."""
    print("Creating extensive demonstration data...")
    print("=" * 50)
    
    # Generate large dataset
    base_date = datetime.now() - timedelta(days=90)  # 3 months of data
    
    # Expanded variables for comprehensive coverage
    variables = [
        {"name": "Plant Height", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#plant_height", "unit": "cm", "range": (10, 150)},
        {"name": "Leaf Area Index", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#leaf_area_index", "unit": "m²/m²", "range": (0.5, 8.0)},
        {"name": "Fresh Biomass", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#fresh_biomass", "unit": "g", "range": (25, 750)},
        {"name": "Dry Biomass", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#dry_biomass", "unit": "g", "range": (5, 150)},
        {"name": "Stem Diameter", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#stem_diameter", "unit": "mm", "range": (2, 30)},
        {"name": "Leaf Count", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#leaf_count", "unit": "count", "range": (3, 75)},
        {"name": "Root Length", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#root_length", "unit": "cm", "range": (8, 45)},
        {"name": "Chlorophyll Content", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#chlorophyll_content", "unit": "SPAD", "range": (20, 65)},
        {"name": "Photosynthesis Rate", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#photosynthesis_rate", "unit": "μmol/m²/s", "range": (3, 40)},
        {"name": "Stomatal Conductance", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#stomatal_conductance", "unit": "mol/m²/s", "range": (0.1, 1.5)},
        {"name": "Water Use Efficiency", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#water_use_efficiency", "unit": "μmol/mmol", "range": (1.0, 8.0)},
        {"name": "Air Temperature", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#air_temperature", "unit": "°C", "range": (12, 38)},
        {"name": "Soil Temperature", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#soil_temperature", "unit": "°C", "range": (10, 32)},
        {"name": "Relative Humidity", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#relative_humidity", "unit": "%", "range": (35, 95)},
        {"name": "Soil Moisture", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#soil_moisture", "unit": "%", "range": (15, 85)},
        {"name": "Light Intensity", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#light_intensity", "unit": "μmol/m²/s", "range": (100, 2000)},
        {"name": "CO2 Concentration", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#co2_concentration", "unit": "ppm", "range": (350, 1200)},
        {"name": "Wind Speed", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#wind_speed", "unit": "m/s", "range": (0.1, 15.0)},
        {"name": "Precipitation", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#precipitation", "unit": "mm", "range": (0, 50)},
        {"name": "Soil pH", "uri": "http://www.phenome-fppn.fr/platform/diaphen/2024/v1#soil_pH", "unit": "pH", "range": (5.5, 8.5)}
    ]
    
    # Generate comprehensive scientific objects
    scientific_objects = []
    
    # Field plots - multiple blocks and treatments
    treatments = ["Control", "Drought", "High-N", "Low-N", "Heat", "Cold", "Salt"]
    
    for block in range(1, 8):  # 7 blocks
        for treatment in treatments:
            for rep in range(1, 11):  # 10 replicates per treatment
                plot_id = f"Block{block}-{treatment}-Rep{rep:02d}"
                scientific_objects.append({
                    "name": plot_id,
                    "uri": f"http://www.phenome-fppn.fr/platform/diaphen/2024/plot-{plot_id.lower()}",
                    "type": "http://www.opensilex.org/vocabulary/oeso#Plot",
                    "category": "plot",
                    "treatment": treatment,
                    "block": block,
                    "replicate": rep
                })
    
    # Individual plants within plots
    plant_count = 0
    for plot in scientific_objects[:200]:  # First 200 plots get individual plants
        for plant_num in range(1, 6):  # 5 plants per plot
            plant_count += 1
            plant_name = f"{plot['name']}-Plant{plant_num}"
            scientific_objects.append({
                "name": plant_name,
                "uri": f"http://www.phenome-fppn.fr/platform/diaphen/2024/plant-{plant_count:04d}",
                "type": "http://www.opensilex.org/vocabulary/oeso#Plant",
                "category": "plant",
                "plot": plot["name"],
                "treatment": plot["treatment"]
            })
    
    # Environmental sensors
    sensor_types = ["Weather", "Soil", "Canopy", "CO2", "Light"]
    for sensor_type in sensor_types:
        for sensor_num in range(1, 21):  # 20 sensors of each type
            sensor_name = f"{sensor_type}-Sensor-{sensor_num:02d}"
            scientific_objects.append({
                "name": sensor_name,
                "uri": f"http://www.phenome-fppn.fr/platform/diaphen/2024/sensor-{sensor_type.lower()}-{sensor_num:02d}",
                "type": "http://www.opensilex.org/vocabulary/oeso#SensingDevice",
                "category": "sensor",
                "sensor_type": sensor_type
            })
    
    print(f"   Generated {len(scientific_objects)} scientific objects:")
    plots = len([o for o in scientific_objects if o['category'] == 'plot'])
    plants = len([o for o in scientific_objects if o['category'] == 'plant'])
    sensors = len([o for o in scientific_objects if o['category'] == 'sensor'])
    print(f"     - {plots} plots")
    print(f"     - {plants} plants")
    print(f"     - {sensors} sensors")
    
    # Generate massive measurement dataset
    print(f"   Generating measurements over 90 days...")
    
    measurements = []
    measurement_id = 0
    
    for day in range(90):  # 90 days of data
        current_date = base_date + timedelta(days=day)
        
        # Variable daily measurement intensity
        if day % 7 < 5:  # Weekdays - more measurements
            daily_measurements = random.randint(200, 400)
        else:  # Weekends - fewer measurements
            daily_measurements = random.randint(50, 150)
        
        for _ in range(daily_measurements):
            measurement_id += 1
            
            # Select variable and object with some logic
            variable = random.choice(variables)
            obj = random.choice(scientific_objects)
            
            # Skip incompatible combinations
            if obj['category'] == 'sensor':
                # Sensors only measure environmental variables
                env_vars = [v for v in variables if any(word in v['name'].lower() 
                          for word in ['temperature', 'humidity', 'moisture', 'light', 'co2', 'wind', 'precipitation', 'ph'])]
                if variable not in env_vars:
                    continue
                variable = random.choice(env_vars)
            
            elif obj['category'] == 'plant':
                # Plants don't measure environmental variables directly
                plant_vars = [v for v in variables if not any(word in v['name'].lower() 
                            for word in ['temperature', 'humidity', 'moisture', 'light', 'co2', 'wind', 'precipitation', 'ph'])]
                if plant_vars:
                    variable = random.choice(plant_vars)
            
            # Generate realistic values with growth/seasonal patterns
            min_val, max_val = variable['range']
            
            # Base value
            base_value = random.uniform(min_val, max_val)
            
            # Add temporal trends
            if obj['category'] == 'plant':
                # Growth trend for plants
                growth_factor = 1 + (day / 90) * random.uniform(0.3, 0.8)
                base_value *= growth_factor
                
                # Treatment effects
                if obj.get('treatment') == 'Drought':
                    base_value *= random.uniform(0.6, 0.9)  # Reduced growth
                elif obj.get('treatment') == 'High-N':
                    base_value *= random.uniform(1.1, 1.4)  # Enhanced growth
                elif obj.get('treatment') == 'Heat':
                    base_value *= random.uniform(0.7, 1.1)  # Variable response
            
            # Environmental variations
            if 'temperature' in variable['name'].lower():
                # Seasonal temperature variation
                seasonal_temp = 5 * math.sin((day / 90) * 3.14159) + random.uniform(-3, 3)
                base_value += seasonal_temp
            
            # Add measurement time
            measurement_time = current_date + timedelta(
                hours=random.randint(6, 20),
                minutes=random.randint(0, 59),
                seconds=random.randint(0, 59)
            )
            
            # Quality and confidence based on measurement method
            methods = ["Manual", "Automated", "Semi-automated", "Remote sensing"]
            method = random.choice(methods)
            
            if method == "Automated":
                confidence = random.uniform(0.92, 0.99)
            elif method == "Manual":
                confidence = random.uniform(0.85, 0.95)
            else:
                confidence = random.uniform(0.88, 0.97)
            
            # Ensure value is within reasonable bounds
            value = max(min_val, min(max_val, base_value))
            
            # Round based on variable type
            if variable['unit'] in ['count', 'pH']:
                value = round(value, 0)
            elif variable['unit'] in ['cm', 'mm', '°C', '%']:
                value = round(value, 1)
            else:
                value = round(value, 2)
            
            measurements.append({
                'measurement_id': f"DEMO_{measurement_id:06d}",
                'target_uri': obj['uri'],
                'target_name': obj['name'],
                'target_type': obj['type'],
                'target_category': obj['category'],
                'variable_uri': variable['uri'],
                'variable_name': variable['name'],
                'variable_unit': variable['unit'],
                'value': value,
                'date': measurement_time.strftime('%Y-%m-%d %H:%M:%S'),
                'confidence': round(confidence, 3),
                'measurement_method': method,
                'operator': random.choice(['researcher_01', 'researcher_02', 'researcher_03', 'sensor_system', 'field_team']),
                'treatment': obj.get('treatment', 'None'),
                'block': obj.get('block', 'N/A'),
                'replicate': obj.get('replicate', 'N/A'),
                'notes': f'Demo measurement day {day + 1} - {variable["name"]}'
            })
        
        # Progress update
        if (day + 1) % 10 == 0:
            print(f"     Progress: {day + 1}/90 days completed ({len(measurements)} measurements so far)")
    
    print(f"   Generated {len(measurements)} total measurements")
    
    # Create comprehensive dataset
    demo_dataset = {
        "created_at": datetime.now().isoformat(),
        "description": "Comprehensive demonstration dataset for OpenSilex population",
        "purpose": "Website demonstration and testing with realistic scientific data",
        "dataset_info": {
            "variables": len(variables),
            "scientific_objects": len(scientific_objects),
            "measurements": len(measurements),
            "date_range": {
                "start": base_date.strftime('%Y-%m-%d'),
                "end": (base_date + timedelta(days=89)).strftime('%Y-%m-%d')
            },
            "categories": {
                "plots": plots,
                "plants": plants,
                "sensors": sensors
            },
            "treatments": treatments
        },
        "variables": variables,
        "scientific_objects": scientific_objects,
        "measurements": measurements
    }
    
    # Save comprehensive dataset
    json_file = "website_population_dataset.json"
    with open(json_file, 'w') as f:
        json.dump(demo_dataset, f, indent=2)
    print(f"   Saved complete dataset: {json_file}")
    
    # Save measurements as CSV for import
    csv_file = "website_population_measurements.csv"
    df = pd.DataFrame(measurements)
    df.to_csv(csv_file, index=False)
    print(f"   Saved measurements CSV: {csv_file} ({len(measurements)} rows)")
    
    # Create summary statistics
    summary_stats = {
        "measurement_summary": {
            "total_measurements": len(measurements),
            "measurements_per_day": len(measurements) / 90,
            "variables_measured": len(set(m['variable_name'] for m in measurements)),
            "objects_measured": len(set(m['target_name'] for m in measurements)),
            "treatments_included": len(set(m['treatment'] for m in measurements if m['treatment'] != 'None'))
        },
        "variable_distribution": {},
        "object_distribution": {},
        "treatment_distribution": {}
    }
    
    # Calculate distributions
    for measurement in measurements:
        var = measurement['variable_name']
        obj_cat = measurement['target_category']
        treatment = measurement['treatment']
        
        summary_stats["variable_distribution"][var] = summary_stats["variable_distribution"].get(var, 0) + 1
        summary_stats["object_distribution"][obj_cat] = summary_stats["object_distribution"].get(obj_cat, 0) + 1
        summary_stats["treatment_distribution"][treatment] = summary_stats["treatment_distribution"].get(treatment, 0) + 1
    
    # Save summary
    summary_file = "website_population_summary.json"
    with open(summary_file, 'w') as f:
        json.dump(summary_stats, f, indent=2)
    print(f"   Saved summary statistics: {summary_file}")
    
    return demo_dataset

def create_import_instructions():
    """Create detailed import instructions."""
    instructions = {
        "import_instructions": {
            "description": "How to import the website population data",
            "files_created": [
                "website_population_measurements.csv",
                "website_population_dataset.json",
                "website_population_summary.json"
            ],
            "import_methods": [
                {
                    "method": "Using comprehensive import script",
                    "command": "python import_mock_data.py",
                    "description": "Full automated import with authentication"
                },
                {
                    "method": "Using CSV import script",
                    "command": "python import_scripts/csv_data_importer.py website_population_measurements.csv",
                    "description": "Import measurements using existing CSV importer"
                },
                {
                    "method": "Manual web interface",
                    "steps": [
                        "1. Log into OpenSilex web interface",
                        "2. Navigate to Data Import section",
                        "3. Upload website_population_measurements.csv",
                        "4. Map columns according to import_mapping.json",
                        "5. Execute import"
                    ]
                }
            ],
            "column_mapping": {
                "target": "target_uri",
                "variable": "variable_uri",
                "value": "value",
                "date": "date",
                "confidence": "confidence"
            },
            "expected_results": {
                "measurements_imported": "20000+",
                "time_range": "90 days of data",
                "coverage": "Multiple experiments, treatments, and variables"
            }
        }
    }
    
    instructions_file = "import_instructions.json"
    with open(instructions_file, 'w') as f:
        json.dump(instructions, f, indent=2)
    
    return instructions

def main():
    """Main function to create and prepare website population data."""
    print("OpenSilex Website Population Tool")
    print("=" * 60)
    print("This tool creates comprehensive demonstration data to")
    print("populate your OpenSilex website with realistic content.")
    print("The dataset includes:")
    print("- Multiple experiments and treatments")
    print("- Thousands of scientific objects (plots, plants, sensors)")
    print("- 20,000+ measurements over 90 days")  
    print("- Realistic temporal and treatment patterns")
    print("- Environmental and plant physiological data\n")
    
    # Create the comprehensive dataset
    demo_dataset = create_extensive_demo_data()
    
    # Create import instructions
    instructions = create_import_instructions()
    
    print(f"\nWebsite Population Data Ready!")
    print(f"=" * 60)
    print(f"Dataset Statistics:")
    info = demo_dataset["dataset_info"]
    print(f"   Variables: {info['variables']}")
    print(f"   Scientific Objects: {info['scientific_objects']}")
    print(f"   Measurements: {info['measurements']:,}")
    print(f"   Date Range: {info['date_range']['start']} to {info['date_range']['end']}")
    print(f"   Plots: {info['categories']['plots']}")
    print(f"   Plants: {info['categories']['plants']}")
    print(f"   Sensors: {info['categories']['sensors']}")
    
    print(f"\nFiles Created:")
    print(f"   - website_population_measurements.csv ({info['measurements']:,} rows)")
    print(f"   - website_population_dataset.json (complete dataset)")
    print(f"   - website_population_summary.json (statistics)")
    print(f"   - import_instructions.json (how to import)")
    
    print(f"\nReady to Import!")
    print(f"Choose your import method:")
    print(f"1. Automated: python import_mock_data.py")
    print(f"2. CSV Import: python import_scripts/csv_data_importer.py website_population_measurements.csv")
    print(f"3. Web Interface: Upload CSV manually")
    
    print(f"\nThis will add {info['measurements']:,} measurements to your OpenSilex!")
    print(f"Your website will be filled with comprehensive scientific data")
    
    return 0

if __name__ == "__main__":
    exit(main())