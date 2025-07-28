#!/usr/bin/env python3
"""
Configuration management utility for OpenSilex client.

This provides centralized configuration management for server settings,
authentication, and common parameters.
"""

import os
import json
from typing import Dict, Any, Optional
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class OpenSilexConfig:
    """Configuration manager for OpenSilex client settings."""
    
    DEFAULT_CONFIG = {
        'server': {
            'host': 'http://98.71.237.204:8666',
            'timeout': 30,
            'verify_ssl': True
        },
        'auth': {
            'token_file': '~/.opensilex_token.json',
            'auto_refresh': True,
            'save_credentials': False
        },
        'api': {
            'default_page_size': 50,
            'max_retries': 3,
            'retry_delay': 1.0
        },
        'logging': {
            'level': 'INFO',
            'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        },
        'data': {
            'default_confidence': 0.9,
            'validate_uris': True,
            'date_format': '%Y-%m-%dT%H:%M:%S'
        }
    }
    
    def __init__(self, config_file: str = None):
        """
        Initialize configuration manager.
        
        Args:
            config_file: Path to configuration file (default: ~/.opensilex_config.json)
        """
        self.config_file = config_file or os.path.expanduser('~/.opensilex_config.json')
        self.config = self.DEFAULT_CONFIG.copy()
        self._load_config()
        self._apply_environment_overrides()
    
    def _load_config(self):
        """Load configuration from file if it exists."""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    file_config = json.load(f)
                self._deep_update(self.config, file_config)
                logger.info(f"Configuration loaded from: {self.config_file}")
            else:
                logger.info("No configuration file found, using defaults")
        except Exception as e:
            logger.warning(f"Failed to load configuration file: {e}")
    
    def _apply_environment_overrides(self):
        """Apply environment variable overrides."""
        env_mappings = {
            'OPENSILEX_HOST': ['server', 'host'],
            'OPENSILEX_TIMEOUT': ['server', 'timeout'],
            'OPENSILEX_TOKEN_FILE': ['auth', 'token_file'],
            'OPENSILEX_PAGE_SIZE': ['api', 'default_page_size'],
            'OPENSILEX_LOG_LEVEL': ['logging', 'level'],
            'OPENSILEX_VERIFY_SSL': ['server', 'verify_ssl']
        }
        
        for env_var, config_path in env_mappings.items():
            env_value = os.getenv(env_var)
            if env_value:
                self._set_nested_value(self.config, config_path, self._convert_env_value(env_value))
                logger.debug(f"Applied environment override: {env_var} = {env_value}")
    
    def _deep_update(self, base_dict: Dict, update_dict: Dict):
        """Deep update of nested dictionary."""
        for key, value in update_dict.items():
            if key in base_dict and isinstance(base_dict[key], dict) and isinstance(value, dict):
                self._deep_update(base_dict[key], value)
            else:
                base_dict[key] = value
    
    def _set_nested_value(self, config: Dict, path: list, value: Any):
        """Set a nested configuration value."""
        for key in path[:-1]:
            config = config.setdefault(key, {})
        config[path[-1]] = value
    
    def _convert_env_value(self, value: str) -> Any:
        """Convert environment variable string to appropriate type."""
        # Try to convert to appropriate type
        if value.lower() in ('true', 'false'):
            return value.lower() == 'true'
        try:
            # Try integer first
            if '.' not in value:
                return int(value)
            # Then float
            return float(value)
        except ValueError:
            # Return as string
            return value
    
    def get(self, section: str, key: str = None, default: Any = None) -> Any:
        """
        Get configuration value.
        
        Args:
            section: Configuration section
            key: Configuration key (optional, returns whole section if None)
            default: Default value if not found
            
        Returns:
            Configuration value
        """
        try:
            section_config = self.config.get(section, {})
            if key is None:
                return section_config
            return section_config.get(key, default)
        except Exception:
            return default
    
    def set(self, section: str, key: str, value: Any):
        """
        Set configuration value.
        
        Args:
            section: Configuration section
            key: Configuration key
            value: Value to set
        """
        if section not in self.config:
            self.config[section] = {}
        self.config[section][key] = value
    
    def save(self):
        """Save current configuration to file."""
        try:
            os.makedirs(os.path.dirname(self.config_file), exist_ok=True)
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
            logger.info(f"Configuration saved to: {self.config_file}")
        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")
    
    def reset_to_defaults(self):
        """Reset configuration to defaults."""
        self.config = self.DEFAULT_CONFIG.copy()
        logger.info("Configuration reset to defaults")
    
    def get_server_config(self) -> Dict[str, Any]:
        """Get server configuration."""
        return self.get('server')
    
    def get_auth_config(self) -> Dict[str, Any]:
        """Get authentication configuration."""
        return self.get('auth')
    
    def get_api_config(self) -> Dict[str, Any]:
        """Get API configuration."""
        return self.get('api')
    
    def get_data_config(self) -> Dict[str, Any]:
        """Get data configuration."""
        return self.get('data')
    
    def setup_logging(self):
        """Setup logging based on configuration."""
        log_config = self.get('logging')
        log_level = getattr(logging, log_config.get('level', 'INFO').upper(), logging.INFO)
        log_format = log_config.get('format', '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        
        logging.basicConfig(level=log_level, format=log_format)
        logger.info(f"Logging configured: level={log_config.get('level')}")

# Global configuration instance
_global_config = None

def get_config(config_file: str = None) -> OpenSilexConfig:
    """
    Get global configuration instance.
    
    Args:
        config_file: Configuration file path (only used on first call)
        
    Returns:
        OpenSilexConfig instance
    """
    global _global_config
    if _global_config is None:
        _global_config = OpenSilexConfig(config_file)
    return _global_config

def create_default_config(config_file: str = None):
    """
    Create a default configuration file.
    
    Args:
        config_file: Path for configuration file (default: ~/.opensilex_config.json)
    """
    config_path = config_file or os.path.expanduser('~/.opensilex_config.json')
    
    try:
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, 'w') as f:
            json.dump(OpenSilexConfig.DEFAULT_CONFIG, f, indent=2)
        print(f"Default configuration created at: {config_path}")
        return config_path
    except Exception as e:
        print(f"Failed to create configuration file: {e}")
        return None

def print_config_info():
    """Print information about current configuration."""
    config = get_config()
    
    print("OpenSilex Configuration")
    print("======================")
    print(f"Config file: {config.config_file}")
    print(f"File exists: {os.path.exists(config.config_file)}")
    print()
    
    print("Server Settings:")
    server_config = config.get_server_config()
    for key, value in server_config.items():
        print(f"  {key}: {value}")
    print()
    
    print("Authentication Settings:")
    auth_config = config.get_auth_config()
    for key, value in auth_config.items():
        if 'password' not in key.lower():  # Don't print passwords
            print(f"  {key}: {value}")
    print()
    
    print("API Settings:")
    api_config = config.get_api_config()
    for key, value in api_config.items():
        print(f"  {key}: {value}")
    print()
    
    print("Environment Variables:")
    env_vars = [
        'OPENSILEX_HOST', 'OPENSILEX_TIMEOUT', 'OPENSILEX_TOKEN_FILE',
        'OPENSILEX_PAGE_SIZE', 'OPENSILEX_LOG_LEVEL', 'OPENSILEX_VERIFY_SSL'
    ]
    for var in env_vars:
        value = os.getenv(var)
        print(f"  {var}: {value or 'Not set'}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="OpenSilex Configuration Management")
    parser.add_argument('--create-default', action='store_true', 
                       help='Create default configuration file')
    parser.add_argument('--show-config', action='store_true',
                       help='Show current configuration')
    parser.add_argument('--config-file', type=str,
                       help='Configuration file path')
    
    args = parser.parse_args()
    
    if args.create_default:
        create_default_config(args.config_file)
    elif args.show_config:
        print_config_info()
    else:
        print("Use --help for available options")
        print_config_info()