#!/usr/bin/env python3
"""
Import or create minimal factors referenced by experiments.
Factors appear to be experiment-specific and may not have a separate import endpoint.
This script creates minimal factor stubs to satisfy experiment dependencies.
"""

import sys
import os
import requests
import urllib.parse
from typing import Dict, Set
from opensilex_client import OpenSILEXClient, test_vm_connection


def extract_factors_from_experiments(sandbox_client: OpenSILEXClient) -> Set[str]:
    """Extract all factor URIs from experiments"""
    factors = set()
    
    print("[INFO] Extracting factor references from experiments...")
    basic_experiments = sandbox_client.get_all_items("core/experiments")
    
    for i, basic_exp in enumerate(basic_experiments):
        exp_uri = basic_exp['uri']
        encoded_uri = urllib.parse.quote(exp_uri, safe='')
        
        try:
            response = requests.get(
                f"{sandbox_client.base_url}/rest/core/experiments/{encoded_uri}",
                headers=sandbox_client.get_headers()
            )
            
            if response.status_code == 200:
                detailed_exp = response.json()['result']
                exp_factors = detailed_exp.get('factors', [])
                
                for factor_uri in exp_factors:
                    factors.add(factor_uri)
                
                if exp_factors:
                    print(f"[OK] Experiment {i+1}: found {len(exp_factors)} factors")
                    
        except Exception as e:
            print(f"[WARNING] Error processing experiment {i+1}: {e}")
    
    return factors


def create_minimal_factor(vm_client: OpenSILEXClient, factor_uri: str) -> bool:
    """Create a minimal factor stub"""
    try:
        # Extract factor name from URI
        factor_id = factor_uri.split('/')[-1] if '/' in factor_uri else factor_uri
        
        minimal_factor = {
            'uri': factor_uri,
            'name': factor_id.replace('_', ' ').replace('.', ' - ').title(),
            'description': f"Imported factor from sandbox: {factor_id}"
        }
        
        # Try to create the factor
        return vm_client.create_item('core/factors', minimal_factor)
        
    except Exception as e:
        print(f"[ERROR] Error creating minimal factor {factor_uri}: {e}")
        return False


def main():
    """Main function to import/create factors"""
    # Configuration
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://172.211.86.191:8666"
    VM_USER = os.getenv("VM_USER", "admin@opensilex.org")
    VM_PASS = os.getenv("VM_PASS", "admin")
    
    # If environment variables not set, try to get from command line args
    if len(sys.argv) >= 3:
        VM_USER = sys.argv[1]
        VM_PASS = sys.argv[2]
    
    print(f"[INFO] Using VM credentials: {VM_USER} (password hidden)")
    
    # Initialize clients
    sandbox = OpenSILEXClient(SANDBOX_URL, SANDBOX_USER, SANDBOX_PASS)
    vm = OpenSILEXClient(VM_URL, VM_USER, VM_PASS)
    
    # Test VM connection
    print("\n=== Testing VM Connection ===")
    if not test_vm_connection(vm):
        print(f"[ERROR] Cannot connect to VM at {VM_URL}")
        return False
    else:
        print(f"[OK] VM is accessible at {VM_URL}")
    
    # Authenticate
    print("\n=== Authenticating ===")
    if not sandbox.authenticate():
        print("[ERROR] Failed to authenticate with sandbox")
        return False
    
    if not vm.authenticate():
        print("[ERROR] Failed to authenticate with VM")
        return False
    
    # Extract factors from experiments
    print("\n=== Extracting Factors from Experiments ===")
    factors = extract_factors_from_experiments(sandbox)
    
    if not factors:
        print("[WARNING] No factors found in experiments")
        return False
    
    print(f"[INFO] Found {len(factors)} unique factors referenced by experiments")
    
    # Create minimal factors
    print(f"\n=== Creating Minimal Factors ===")
    success_count = 0
    
    for i, factor_uri in enumerate(factors, 1):
        print(f"[INFO] Creating minimal factor {i}/{len(factors)}: {factor_uri}")
        
        if create_minimal_factor(vm, factor_uri):
            success_count += 1
            print(f"[OK] Created factor {i}/{len(factors)}")
        else:
            print(f"[ERROR] Failed to create factor {i}/{len(factors)}: {factor_uri}")
    
    print(f"[OK] Successfully created {success_count}/{len(factors)} factors")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} factors created successfully!")
        return True
    else:
        print("\n[WARNING] No factors were created")
        return False


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n[INFO] Import cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)