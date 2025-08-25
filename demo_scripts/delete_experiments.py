from opensilex_client import OpenSILEXClient
import os
import requests
import urllib.parse

vm = OpenSILEXClient('http://172.211.86.191:8666', os.getenv('VM_USER', 'admin@opensilex.org'), os.getenv('VM_PASS', 'admin'))
vm.authenticate()

experiments = vm.get_all_items('core/experiments')
print(f'Deleting {len(experiments)} experiments...')

for exp in experiments:
    encoded_uri = urllib.parse.quote(exp['uri'], safe='')
    response = requests.delete(f'http://172.211.86.191:8666/rest/core/experiments/{encoded_uri}', headers=vm.get_headers())
    if response.status_code == 200:
        print(f'Deleted: {exp.get("name", "Unknown")}')
    else:
        print(f'Failed to delete: {exp.get("name", "Unknown")}')