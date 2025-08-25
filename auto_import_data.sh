#!/bin/bash

# Monitor scientific objects import and auto-start data import when finished
SCIENTIFIC_PID=$(ps aux | grep -v grep | grep "import_scientific_objects.py" | awk '{print $2}')

if [ -z "$SCIENTIFIC_PID" ]; then
    echo "$(date): No scientific objects import process found. Starting data import immediately."
    nohup python3 -u import_data.py > data_import.log 2>&1 &
    echo "$(date): Data import started with PID $!"
    exit 0
fi

echo "$(date): Monitoring scientific objects import (PID: $SCIENTIFIC_PID)"
echo "$(date): Will start data import automatically when finished..."

# Wait for the scientific objects process to finish
while kill -0 $SCIENTIFIC_PID 2>/dev/null; do
    sleep 30  # Check every 30 seconds
done

echo "$(date): Scientific objects import finished. Starting data import..."
nohup python3 -u import_data.py > data_import.log 2>&1 &
DATA_PID=$!
echo "$(date): Data import started with PID $DATA_PID"
echo "$(date): Monitor progress with: tail -f data_import.log"
