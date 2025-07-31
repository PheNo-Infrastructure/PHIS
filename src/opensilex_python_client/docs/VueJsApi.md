# opensilex_swagger_client.VueJsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_config**](VueJsApi.md#get_config) | **GET** /vuejs/config | Return the current configuration
[**get_extension**](VueJsApi.md#get_extension) | **GET** /vuejs/extension/js/{module}.js | Return the front Vue JS extension file to include
[**get_extension_style**](VueJsApi.md#get_extension_style) | **GET** /vuejs/extension/css/{module}.css | Return the front Vue JS extension css file to include
[**get_theme_config**](VueJsApi.md#get_theme_config) | **GET** /vuejs/theme/{moduleId}/{themeId}/config | Return the front Vue JS theme configuration
[**get_theme_css**](VueJsApi.md#get_theme_css) | **GET** /vuejs/theme/{moduleId}/{themeId}/style.css | Return the theme css file
[**get_theme_resource**](VueJsApi.md#get_theme_resource) | **GET** /vuejs/theme/{moduleId}/{themeId}/resource | Return the theme requested resource
[**get_user_config**](VueJsApi.md#get_user_config) | **GET** /vuejs/user_config | Return the user-specific configuration

# **get_config**
> FrontConfigDTO get_config(accept_language=accept_language)

Return the current configuration

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsApi()
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Return the current configuration
    api_response = api_instance.get_config(accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsApi->get_config: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**FrontConfigDTO**](FrontConfigDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_extension**
> str get_extension(module)

Return the front Vue JS extension file to include

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsApi()
module = 'module_example' # str | Module identifier

try:
    # Return the front Vue JS extension file to include
    api_response = api_instance.get_extension(module)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsApi->get_extension: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **module** | **str**| Module identifier | 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/octet-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_extension_style**
> str get_extension_style(module)

Return the front Vue JS extension css file to include

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsApi()
module = 'module_example' # str | Module identifier

try:
    # Return the front Vue JS extension css file to include
    api_response = api_instance.get_extension_style(module)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsApi->get_extension_style: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **module** | **str**| Module identifier | 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/octet-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_theme_config**
> ThemeConfigDTO get_theme_config(module_id, theme_id)

Return the front Vue JS theme configuration

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsApi()
module_id = 'module_id_example' # str | Module identifier
theme_id = 'theme_id_example' # str | Theme identifier

try:
    # Return the front Vue JS theme configuration
    api_response = api_instance.get_theme_config(module_id, theme_id)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsApi->get_theme_config: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **module_id** | **str**| Module identifier | 
 **theme_id** | **str**| Theme identifier | 

### Return type

[**ThemeConfigDTO**](ThemeConfigDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_theme_css**
> str get_theme_css(module_id, theme_id)

Return the theme css file

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsApi()
module_id = 'module_id_example' # str | Module identifier
theme_id = 'theme_id_example' # str | Theme identifier

try:
    # Return the theme css file
    api_response = api_instance.get_theme_css(module_id, theme_id)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsApi->get_theme_css: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **module_id** | **str**| Module identifier | 
 **theme_id** | **str**| Theme identifier | 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/octet-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_theme_resource**
> str get_theme_resource(module_id, theme_id, file_path=file_path, accepted_extensions=accepted_extensions)

Return the theme requested resource

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsApi()
module_id = 'module_id_example' # str | Module identifier
theme_id = 'theme_id_example' # str | Theme identifier
file_path = 'file_path_example' # str | Resource path (optional)
accepted_extensions = ['accepted_extensions_example'] # list[str] | List of supported file extensions (optional)

try:
    # Return the theme requested resource
    api_response = api_instance.get_theme_resource(module_id, theme_id, file_path=file_path, accepted_extensions=accepted_extensions)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsApi->get_theme_resource: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **module_id** | **str**| Module identifier | 
 **theme_id** | **str**| Theme identifier | 
 **file_path** | **str**| Resource path | [optional] 
 **accepted_extensions** | [**list[str]**](str.md)| List of supported file extensions | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/octet-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_user_config**
> UserFrontConfigDTO get_user_config(accept_language=accept_language)

Return the user-specific configuration

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsApi()
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Return the user-specific configuration
    api_response = api_instance.get_user_config(accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsApi->get_user_config: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**UserFrontConfigDTO**](UserFrontConfigDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

