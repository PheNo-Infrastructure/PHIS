# opensilex_swagger_client.VueJsOntologyExtensionApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**create_rdf_type**](VueJsOntologyExtensionApi.md#create_rdf_type) | **POST** /vuejs/owl_extension/rdf_type | Create a custom class
[**delete_rdf_type**](VueJsOntologyExtensionApi.md#delete_rdf_type) | **DELETE** /vuejs/owl_extension/rdf_type/{uri} | Delete a RDF type
[**get_data_types1**](VueJsOntologyExtensionApi.md#get_data_types1) | **GET** /vuejs/owl_extension/data_types | Return literal datatypes definition
[**get_object_types**](VueJsOntologyExtensionApi.md#get_object_types) | **GET** /vuejs/owl_extension/object_types | Return object types definition
[**get_rdf_type1**](VueJsOntologyExtensionApi.md#get_rdf_type1) | **GET** /vuejs/owl_extension/rdf_type | Return rdf type model definition with properties
[**get_rdf_type_properties**](VueJsOntologyExtensionApi.md#get_rdf_type_properties) | **GET** /vuejs/owl_extension/rdf_type_properties | Return class model properties definitions
[**get_rdf_types_parameters**](VueJsOntologyExtensionApi.md#get_rdf_types_parameters) | **GET** /vuejs/owl_extension/rdf_types_parameters | Return RDF types parameters for Vue.js application
[**set_rdf_type_properties_order**](VueJsOntologyExtensionApi.md#set_rdf_type_properties_order) | **PUT** /vuejs/owl_extension/properties_order | Define properties order
[**update_rdf_type**](VueJsOntologyExtensionApi.md#update_rdf_type) | **PUT** /vuejs/owl_extension/rdf_type | Update a custom class

# **create_rdf_type**
> str create_rdf_type(authorization, body=body, accept_language=accept_language)

Create a custom class

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.VueRDFTypeDTO() # VueRDFTypeDTO | Class description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create a custom class
    api_response = api_instance.create_rdf_type(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->create_rdf_type: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**VueRDFTypeDTO**](VueRDFTypeDTO.md)| Class description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_rdf_type**
> str delete_rdf_type(uri, authorization, accept_language=accept_language)

Delete a RDF type

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()
uri = 'uri_example' # str | RDF type
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a RDF type
    api_response = api_instance.delete_rdf_type(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->delete_rdf_type: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| RDF type | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_data_types1**
> list[VueDataTypeDTO] get_data_types1()

Return literal datatypes definition

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()

try:
    # Return literal datatypes definition
    api_response = api_instance.get_data_types1()
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->get_data_types1: %s\n" % e)
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**list[VueDataTypeDTO]**](VueDataTypeDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_object_types**
> list[VueObjectTypeDTO] get_object_types()

Return object types definition

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()

try:
    # Return object types definition
    api_response = api_instance.get_object_types()
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->get_object_types: %s\n" % e)
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**list[VueObjectTypeDTO]**](VueObjectTypeDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_rdf_type1**
> VueRDFTypeDTO get_rdf_type1(rdf_type, authorization, parent_type=parent_type, accept_language=accept_language)

Return rdf type model definition with properties

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()
rdf_type = 'rdf_type_example' # str | RDF type URI
authorization = 'authorization_example' # str | Authentication token
parent_type = 'parent_type_example' # str | Parent RDF class URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Return rdf type model definition with properties
    api_response = api_instance.get_rdf_type1(rdf_type, authorization, parent_type=parent_type, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->get_rdf_type1: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **rdf_type** | **str**| RDF type URI | 
 **authorization** | **str**| Authentication token | 
 **parent_type** | **str**| Parent RDF class URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**VueRDFTypeDTO**](VueRDFTypeDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_rdf_type_properties**
> VueRDFTypeDTO get_rdf_type_properties(rdf_type, parent_type, authorization, accept_language=accept_language)

Return class model properties definitions

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()
rdf_type = 'rdf_type_example' # str | RDF class URI
parent_type = 'parent_type_example' # str | Parent RDF class URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Return class model properties definitions
    api_response = api_instance.get_rdf_type_properties(rdf_type, parent_type, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->get_rdf_type_properties: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **rdf_type** | **str**| RDF class URI | 
 **parent_type** | **str**| Parent RDF class URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**VueRDFTypeDTO**](VueRDFTypeDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_rdf_types_parameters**
> list[VueRDFTypeParameterDTO] get_rdf_types_parameters()

Return RDF types parameters for Vue.js application

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()

try:
    # Return RDF types parameters for Vue.js application
    api_response = api_instance.get_rdf_types_parameters()
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->get_rdf_types_parameters: %s\n" % e)
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**list[VueRDFTypeParameterDTO]**](VueRDFTypeParameterDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **set_rdf_type_properties_order**
> str set_rdf_type_properties_order(authorization, rdf_type, body=body, accept_language=accept_language)

Define properties order

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()
authorization = 'authorization_example' # str | Authentication token
rdf_type = 'rdf_type_example' # str | RDF type
body = ['body_example'] # list[str] | Array of properties (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Define properties order
    api_response = api_instance.set_rdf_type_properties_order(authorization, rdf_type, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->set_rdf_type_properties_order: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **rdf_type** | **str**| RDF type | 
 **body** | [**list[str]**](str.md)| Array of properties | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_rdf_type**
> str update_rdf_type(authorization, body=body, accept_language=accept_language)

Update a custom class

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.VueJsOntologyExtensionApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.VueRDFTypeDTO() # VueRDFTypeDTO | RDF type definition (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a custom class
    api_response = api_instance.update_rdf_type(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling VueJsOntologyExtensionApi->update_rdf_type: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**VueRDFTypeDTO**](VueRDFTypeDTO.md)| RDF type definition | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

