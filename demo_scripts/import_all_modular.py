#!/usr/bin/env python3
"""
Master import script that orchestrates all modular sandbox imports.
Runs imports in the correct dependency order and provides comprehensive reporting.
"""

import sys
import os
import subprocess
import time
from typing import Dict, List, Tuple


def run_import_script(script_name: str, description: str, vm_user: str = None, vm_pass: str = None, timeout: int = 1200) -> Tuple[bool, str]:
    """Run an individual import script and return success status and output"""
    print(f"\n{'='*60}")
    print(f"RUNNING: {description}")
    print(f"Script: {script_name}")
    print(f"{'='*60}")
    
    # Build command
    cmd = [sys.executable, script_name]
    if vm_user and vm_pass:
        cmd.extend([vm_user, vm_pass])
    
    try:
        # Run the script
        result = subprocess.run(
            cmd,
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        # Print output in real-time style
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        success = result.returncode == 0
        status = "SUCCESS" if success else "FAILED"
        print(f"\n[{status}] {description} - Return code: {result.returncode}")
        
        return success, result.stdout + result.stderr
        
    except subprocess.TimeoutExpired:
        print(f"[TIMEOUT] {description} timed out after {timeout//60} minutes")
        return False, f"Script timed out after {timeout} seconds"
    except Exception as e:
        print(f"[ERROR] Failed to run {script_name}: {e}")
        return False, str(e)


def main():
    """Main function to run all imports in correct order"""
    print("=" * 80)
    print("OPENSILEX MODULAR SANDBOX IMPORT")
    print("=" * 80)
    print("This script will import data from the OpenSILEX sandbox in the correct dependency order.")
    print("Each import type has its own script for easier troubleshooting.")
    
    # Get VM credentials
    VM_USER = os.getenv("VM_USER", "admin@opensilex.org")
    VM_PASS = os.getenv("VM_PASS", "admin")
    
    # If environment variables not set, try to get from command line args
    if len(sys.argv) >= 3:
        VM_USER = sys.argv[1]
        VM_PASS = sys.argv[2]
    
    print(f"\n[INFO] Using VM credentials: {VM_USER} (password hidden)")
    
    # Define import order and scripts
    # Order is critical due to dependencies!
    # IMPORTANT: We try to import EVERYTHING to maximize dependency resolution
    import_sequence = [
        # Variables and their dependencies (foundation - usually already imported)
        ("import_sandbox_variables.py", "Variables and Dependencies (units, methods, entities, characteristics)", True),
        
        # Core infrastructure (no dependencies between them)
        ("import_organizations.py", "Organizations", False),
        ("import_sites.py", "Sites (depend on organizations)", False),
        ("import_facilities.py", "Facilities (ultra-minimal to avoid ontology errors)", False),
        ("import_experiments.py", "Experiments (depend on facilities and species)", False),
        
        # Devices and provenances (may depend on variables and experiments)
        ("import_devices.py", "Devices (may reference variables in relations)", False),
        ("import_provenances.py", "Provenances (may reference devices)", False),
        
        # Data (depends on variables, provenances, targets - most dependencies)
        ("import_data.py", "Data (depends on variables, provenances, targets)", False),
    ]
    
    # Optional retry sequence for failed imports (run with longer timeouts)
    retry_sequence = [
        # Retry critical imports that may benefit from having more dependencies available
        ("import_devices.py", "Devices (retry after dependencies)", False),
        ("import_provenances.py", "Provenances (retry after devices)", False), 
        ("import_data.py", "Data (retry after all dependencies)", False),
    ]
    
    # Track results
    results = []
    critical_failures = []
    
    print(f"\n[INFO] Will run {len(import_sequence)} import scripts in dependency order")
    print("[INFO] Strategy: Import as much data as possible to resolve maximum dependencies")
    print("[INFO] Individual imports may have failures, but we'll continue to maximize coverage")
    
    # Ask for confirmation
    if len(sys.argv) < 4 or sys.argv[3].lower() not in ['yes', 'y', 'auto']:
        response = input("\nProceed with full import? (y/n): ")
        if response.lower() not in ['y', 'yes']:
            print("[INFO] Import cancelled by user")
            return
    
    start_time = time.time()
    
    # Run each import script - ALWAYS CONTINUE to maximize data import
    for i, (script_name, description, optional) in enumerate(import_sequence, 1):
        print(f"\n[PROGRESS] Step {i}/{len(import_sequence)}: {description}")
        
        # Check if script exists
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), script_name)
        if not os.path.exists(script_path):
            print(f"[SKIP] Script {script_name} not found")
            results.append((script_name, description, "MISSING", "Script not found"))
            continue
        
        # Run the script with appropriate timeout
        timeout = 1800 if "data" in script_name.lower() else 1200  # 30 min for data, 20 min for others
        success, output = run_import_script(script_name, description, VM_USER, VM_PASS, timeout)
        
        if success:
            results.append((script_name, description, "SUCCESS", output))
            print(f"[✓] {description} completed successfully")
        else:
            results.append((script_name, description, "FAILED", output))
            if optional:
                print(f"[!] Optional import {description} failed - continuing to maximize coverage...")
            else:
                print(f"[!] Import {description} failed - continuing to try remaining imports...")
                critical_failures.append(description)
        
        # Brief pause between imports
        time.sleep(1)
    
    # RETRY PHASE: Try failed critical imports again now that more dependencies may be available
    failed_critical_scripts = [(script, desc) for script, desc, status, _ in results 
                               if status == "FAILED" and any(script in retry[0] for retry in retry_sequence)]
    
    if failed_critical_scripts:
        print(f"\n" + "=" * 60)
        print("RETRY PHASE: Attempting failed imports with more dependencies available")
        print(f"Will retry {len(failed_critical_scripts)} critical imports")
        print("=" * 60)
        
        for script_name, original_description in failed_critical_scripts:
            retry_description = f"RETRY: {original_description}"
            print(f"\n[RETRY] Attempting {script_name} again...")
            
            # Use longer timeout for retries
            timeout = 2400 if "data" in script_name.lower() else 1800  # 40 min for data, 30 min for others
            success, output = run_import_script(script_name, retry_description, VM_USER, VM_PASS, timeout)
            
            if success:
                print(f"[✓] RETRY SUCCESS: {original_description}")
                # Update the original result
                for i, (script, desc, status, out) in enumerate(results):
                    if script == script_name:
                        results[i] = (script, desc, "RETRY-SUCCESS", output)
                        break
                # Remove from critical failures
                if original_description in critical_failures:
                    critical_failures.remove(original_description)
            else:
                print(f"[✗] RETRY FAILED: {original_description}")
                # Update with retry attempt info
                for i, (script, desc, status, out) in enumerate(results):
                    if script == script_name:
                        results[i] = (script, desc, "RETRY-FAILED", out + "\n" + output)
                        break
    
    # Final summary
    end_time = time.time()
    duration = end_time - start_time
    
    print("\n" + "=" * 80)
    print("COMPREHENSIVE IMPORT SUMMARY")
    print("=" * 80)
    print("Strategy: Maximum coverage import - attempted all types to resolve dependencies")
    
    successful_imports = 0
    failed_imports = 0
    missing_scripts = 0
    
    print("\nDetailed Results:")
    for script_name, description, status, output in results:
        if status in ["SUCCESS", "RETRY-SUCCESS"]:
            status_symbol = "✓ SUCCESS" if status == "SUCCESS" else "🔄 RETRY-SUCCESS"
            successful_imports += 1
        elif status in ["FAILED", "RETRY-FAILED"]:
            status_symbol = "✗ FAILED " if status == "FAILED" else "🔄 RETRY-FAILED "
            failed_imports += 1
        else:  # MISSING
            status_symbol = "⚠ MISSING"
            missing_scripts += 1
        
        print(f"{status_symbol:<12} {description}")
        
        # Extract import counts from output if available
        if status == "SUCCESS" and "imported successfully" in output:
            try:
                import_line = [line for line in output.split('\n') if "imported successfully" in line][-1]
                if import_line:
                    print(f"             └─ {import_line.strip()}")
            except:
                pass
    
    print(f"\n" + "=" * 50)
    print(f"FINAL STATISTICS:")
    print(f"✓ Successful imports: {successful_imports}")
    print(f"✗ Failed imports: {failed_imports}")
    print(f"⚠ Missing scripts: {missing_scripts}")
    print(f"⏱ Total duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
    
    # Determine overall success
    coverage_percentage = (successful_imports / len(import_sequence)) * 100 if import_sequence else 0
    
    if successful_imports > 0:
        if failed_imports == 0:
            print(f"\n🎉 [COMPLETE SUCCESS] All imports completed successfully! (100% coverage)")
        elif coverage_percentage >= 75:
            print(f"\n✅ [SUBSTANTIAL SUCCESS] {coverage_percentage:.0f}% import coverage achieved!")
            print("Most data should be available with good dependency resolution.")
        elif coverage_percentage >= 50:
            print(f"\n⚠️  [PARTIAL SUCCESS] {coverage_percentage:.0f}% import coverage achieved.")
            print("Some data available, but significant gaps may exist.")
        else:
            print(f"\n❌ [LIMITED SUCCESS] Only {coverage_percentage:.0f}% import coverage achieved.")
            print("Major issues detected - check individual script outputs.")
        
        print("\nYou can now view the imported data in your OpenSILEX web interface:")
        print("🌐 http://172.211.86.191:8666")
        
    else:
        print(f"\n❌ [IMPORT FAILURE] No imports completed successfully.")
        print("Check VM connectivity and credentials.")
    
    # Provide actionable troubleshooting info
    if failed_imports > 0 or critical_failures:
        print(f"\n" + "=" * 50)
        print("TROUBLESHOOTING GUIDANCE:")
        print("You can re-run individual import scripts to retry specific components:")
        
        for script_name, description, status, output in results:
            if status in ["FAILED", "RETRY-FAILED"]:
                retry_note = " (failed even after retry)" if status == "RETRY-FAILED" else ""
                print(f"🔧 python {script_name}{retry_note}")
                # Try to extract specific error info
                if "ERROR" in output:
                    error_lines = [line.strip() for line in output.split('\n') if "[ERROR]" in line]
                    if error_lines:
                        print(f"   └─ Last error: {error_lines[-1][:100]}...")
    
    print(f"\n" + "=" * 50)
    print("AVAILABLE INDIVIDUAL IMPORT SCRIPTS:")
    for script_name, description, _, _ in results:
        print(f"📄 python {script_name}")
        print(f"   └─ {description}")
    
    # Return success if we achieved reasonable coverage
    return coverage_percentage >= 50


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