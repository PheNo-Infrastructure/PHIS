# opensilex_swagger_client.GermplasmApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**create_germplasm**](GermplasmApi.md#create_germplasm) | **POST** /core/germplasm | Add a germplasm
[**create_germplasm_group**](GermplasmApi.md#create_germplasm_group) | **POST** /core/germplasm_group | Add a germplasm group
[**delete_germplasm**](GermplasmApi.md#delete_germplasm) | **DELETE** /core/germplasm/{uri} | Delete a germplasm
[**delete_germplasm_group**](GermplasmApi.md#delete_germplasm_group) | **DELETE** /core/germplasm_group/{uri} | Delete a germplasm group
[**export_germplasm**](GermplasmApi.md#export_germplasm) | **POST** /core/germplasm/export | export germplasm
[**get_germplasm**](GermplasmApi.md#get_germplasm) | **GET** /core/germplasm/{uri} | Get a germplasm
[**get_germplasm_attribute_values**](GermplasmApi.md#get_germplasm_attribute_values) | **GET** /core/germplasm/attributes/{attribute} | Get attribute values of all germplasm for a given attribute
[**get_germplasm_attributes**](GermplasmApi.md#get_germplasm_attributes) | **GET** /core/germplasm/attributes | Get attributes of all germplasm
[**get_germplasm_experiments**](GermplasmApi.md#get_germplasm_experiments) | **GET** /core/germplasm/{uri}/experiments | Get experiments where a germplasm has been used
[**get_germplasm_group**](GermplasmApi.md#get_germplasm_group) | **GET** /core/germplasm_group/{uri} | Get a germplasm group
[**get_germplasm_group_by_uris**](GermplasmApi.md#get_germplasm_group_by_uris) | **GET** /core/germplasm_group/by-uris | Get germplasm groups by their URIs
[**get_germplasm_group_content**](GermplasmApi.md#get_germplasm_group_content) | **GET** /core/germplasm_group/{uri}/germplasm | Get a germplasm group&#x27;s germplasm, paginated
[**get_germplasm_group_with_germplasms**](GermplasmApi.md#get_germplasm_group_with_germplasms) | **GET** /core/germplasm_group/with-germplasm/{uri} | Get a germplasm group with nested germplasm details
[**get_germplasms_by_uri**](GermplasmApi.md#get_germplasms_by_uri) | **POST** /core/germplasm/by_uris | Get a list of germplasms by their URIs
[**search_germplasm**](GermplasmApi.md#search_germplasm) | **GET** /core/germplasm | Search germplasm
[**search_germplasm_groups**](GermplasmApi.md#search_germplasm_groups) | **POST** /core/germplasm_group/search | Search germplasm groups
[**update_germplasm**](GermplasmApi.md#update_germplasm) | **PUT** /core/germplasm | Update a germplasm
[**update_germplasm_group**](GermplasmApi.md#update_germplasm_group) | **PUT** /core/germplasm_group | Update a germplasm group

# **create_germplasm**
> str create_germplasm(authorization, body=body, accept_language=accept_language, check_only=check_only)

Add a germplasm

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.GermplasmCreationDTO() # GermplasmCreationDTO | Germplasm description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
check_only = false # bool | Checking only (optional) (default to false)

try:
    # Add a germplasm
    api_response = api_instance.create_germplasm(authorization, body=body, accept_language=accept_language, check_only=check_only)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->create_germplasm: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**GermplasmCreationDTO**](GermplasmCreationDTO.md)| Germplasm description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **check_only** | **bool**| Checking only | [optional] [default to false]

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_germplasm_group**
> str create_germplasm_group(authorization, body=body, accept_language=accept_language)

Add a germplasm group

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.GermplasmGroupCreationDTO() # GermplasmGroupCreationDTO | Germplasm group description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Add a germplasm group
    api_response = api_instance.create_germplasm_group(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->create_germplasm_group: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**GermplasmGroupCreationDTO**](GermplasmGroupCreationDTO.md)| Germplasm group description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_germplasm**
> delete_germplasm(uri, authorization, accept_language=accept_language)

Delete a germplasm

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uri = 'uri_example' # str | Germplasm URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a germplasm
    api_instance.delete_germplasm(uri, authorization, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling GermplasmApi->delete_germplasm: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Germplasm URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_germplasm_group**
> ObjectUriResponse delete_germplasm_group(uri, authorization, accept_language=accept_language)

Delete a germplasm group

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uri = 'uri_example' # str | Germplasm group URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a germplasm group
    api_response = api_instance.delete_germplasm_group(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->delete_germplasm_group: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Germplasm group URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**ObjectUriResponse**](ObjectUriResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **export_germplasm**
> export_germplasm(authorization, body=body, accept_language=accept_language)

export germplasm

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.GermplasmSearchFilter() # GermplasmSearchFilter | CSV export configuration (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # export germplasm
    api_instance.export_germplasm(authorization, body=body, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling GermplasmApi->export_germplasm: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**GermplasmSearchFilter**](GermplasmSearchFilter.md)| CSV export configuration | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: text/plain

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm**
> GermplasmGetSingleDTO get_germplasm(uri, authorization, accept_language=accept_language)

Get a germplasm

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uri = 'uri_example' # str | germplasm URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a germplasm
    api_response = api_instance.get_germplasm(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| germplasm URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**GermplasmGetSingleDTO**](GermplasmGetSingleDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm_attribute_values**
> list[str] get_germplasm_attribute_values(attribute, authorization, attribute_value=attribute_value, page=page, page_size=page_size, accept_language=accept_language)

Get attribute values of all germplasm for a given attribute

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
attribute = 'attribute_example' # str | 
authorization = 'authorization_example' # str | Authentication token
attribute_value = 'attribute_value_example' # str | Regex pattern for filtering attribute value (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get attribute values of all germplasm for a given attribute
    api_response = api_instance.get_germplasm_attribute_values(attribute, authorization, attribute_value=attribute_value, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm_attribute_values: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **attribute** | **str**|  | 
 **authorization** | **str**| Authentication token | 
 **attribute_value** | **str**| Regex pattern for filtering attribute value | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**list[str]**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm_attributes**
> list[str] get_germplasm_attributes(authorization, accept_language=accept_language)

Get attributes of all germplasm

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get attributes of all germplasm
    api_response = api_instance.get_germplasm_attributes(authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm_attributes: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**list[str]**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm_experiments**
> list[ExperimentGetListDTO] get_germplasm_experiments(uri, authorization, attribute_value=attribute_value, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Get experiments where a germplasm has been used

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uri = 'uri_example' # str | germplasm URI
authorization = 'authorization_example' # str | Authentication token
attribute_value = '.*' # str | Regex pattern for filtering experiments by name (optional) (default to .*)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get experiments where a germplasm has been used
    api_response = api_instance.get_germplasm_experiments(uri, authorization, attribute_value=attribute_value, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm_experiments: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| germplasm URI | 
 **authorization** | **str**| Authentication token | 
 **attribute_value** | **str**| Regex pattern for filtering experiments by name | [optional] [default to .*]
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ExperimentGetListDTO]**](ExperimentGetListDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm_group**
> GermplasmGroupGetDTO get_germplasm_group(uri, authorization, accept_language=accept_language)

Get a germplasm group

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uri = 'uri_example' # str | Germplasm group URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a germplasm group
    api_response = api_instance.get_germplasm_group(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm_group: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Germplasm group URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**GermplasmGroupGetDTO**](GermplasmGroupGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm_group_by_uris**
> list[GermplasmGroupGetDTO] get_germplasm_group_by_uris(uris, authorization, accept_language=accept_language)

Get germplasm groups by their URIs

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uris = ['uris_example'] # list[str] | Germplasm group URIs
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get germplasm groups by their URIs
    api_response = api_instance.get_germplasm_group_by_uris(uris, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm_group_by_uris: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uris** | [**list[str]**](str.md)| Germplasm group URIs | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[GermplasmGroupGetDTO]**](GermplasmGroupGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm_group_content**
> list[GermplasmGetAllDTO] get_germplasm_group_content(uri, authorization, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Get a germplasm group's germplasm, paginated

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uri = 'uri_example' # str | Germplasm group URI
authorization = 'authorization_example' # str | Authentication token
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a germplasm group's germplasm, paginated
    api_response = api_instance.get_germplasm_group_content(uri, authorization, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm_group_content: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Germplasm group URI | 
 **authorization** | **str**| Authentication token | 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[GermplasmGetAllDTO]**](GermplasmGetAllDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasm_group_with_germplasms**
> GermplasmGroupGetWithDetailsDTO get_germplasm_group_with_germplasms(uri, authorization, accept_language=accept_language)

Get a germplasm group with nested germplasm details

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
uri = 'uri_example' # str | Germplasm group URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a germplasm group with nested germplasm details
    api_response = api_instance.get_germplasm_group_with_germplasms(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasm_group_with_germplasms: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Germplasm group URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**GermplasmGroupGetWithDetailsDTO**](GermplasmGroupGetWithDetailsDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_germplasms_by_uri**
> list[GermplasmGetAllDTO] get_germplasms_by_uri(authorization, body=body, accept_language=accept_language)

Get a list of germplasms by their URIs

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Germplasms URIs (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a list of germplasms by their URIs
    api_response = api_instance.get_germplasms_by_uri(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->get_germplasms_by_uri: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Germplasms URIs | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[GermplasmGetAllDTO]**](GermplasmGetAllDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_germplasm**
> list[GermplasmGetAllDTO] search_germplasm(authorization, uri=uri, rdf_type=rdf_type, name=name, code=code, production_year=production_year, species=species, variety=variety, accession=accession, group_of_germplasm=group_of_germplasm, institute=institute, experiment=experiment, parent_germplasms=parent_germplasms, parent_germplasms_m=parent_germplasms_m, parent_germplasms_f=parent_germplasms_f, metadata=metadata, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search germplasm

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
uri = 'uri_example' # str | Regex pattern for filtering list by uri (optional)
rdf_type = 'rdf_type_example' # str | Search by type (optional)
name = '.*' # str | Regex pattern for filtering list by name and synonyms (optional) (default to .*)
code = '.*' # str | Regex pattern for filtering list by code (optional) (default to .*)
production_year = 56 # int | Search by production year (optional)
species = 'species_example' # str | Search by species (optional)
variety = 'variety_example' # str | Search by variety (optional)
accession = 'accession_example' # str | Search by accession (optional)
group_of_germplasm = 'group_of_germplasm_example' # str | Group filter (optional)
institute = 'institute_example' # str | Search by institute (optional)
experiment = 'experiment_example' # str | Search by experiment (optional)
parent_germplasms = ['parent_germplasms_example'] # list[str] | Search by parent varieties A or B (optional)
parent_germplasms_m = ['parent_germplasms_m_example'] # list[str] | Search by parent varieties A (optional)
parent_germplasms_f = ['parent_germplasms_f_example'] # list[str] | Search by parent varieties B (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search germplasm
    api_response = api_instance.search_germplasm(authorization, uri=uri, rdf_type=rdf_type, name=name, code=code, production_year=production_year, species=species, variety=variety, accession=accession, group_of_germplasm=group_of_germplasm, institute=institute, experiment=experiment, parent_germplasms=parent_germplasms, parent_germplasms_m=parent_germplasms_m, parent_germplasms_f=parent_germplasms_f, metadata=metadata, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->search_germplasm: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **uri** | **str**| Regex pattern for filtering list by uri | [optional] 
 **rdf_type** | **str**| Search by type | [optional] 
 **name** | **str**| Regex pattern for filtering list by name and synonyms | [optional] [default to .*]
 **code** | **str**| Regex pattern for filtering list by code | [optional] [default to .*]
 **production_year** | **int**| Search by production year | [optional] 
 **species** | **str**| Search by species | [optional] 
 **variety** | **str**| Search by variety | [optional] 
 **accession** | **str**| Search by accession | [optional] 
 **group_of_germplasm** | **str**| Group filter | [optional] 
 **institute** | **str**| Search by institute | [optional] 
 **experiment** | **str**| Search by experiment | [optional] 
 **parent_germplasms** | [**list[str]**](str.md)| Search by parent varieties A or B | [optional] 
 **parent_germplasms_m** | [**list[str]**](str.md)| Search by parent varieties A | [optional] 
 **parent_germplasms_f** | [**list[str]**](str.md)| Search by parent varieties B | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[GermplasmGetAllDTO]**](GermplasmGetAllDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_germplasm_groups**
> list[GermplasmGroupGetDTO] search_germplasm_groups(authorization, name=name, germplasm=germplasm, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search germplasm groups

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
name = 'name_example' # str | Regex pattern for filtering by name (optional)
germplasm = ['germplasm_example'] # list[str] | Germplasm URIs (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search germplasm groups
    api_response = api_instance.search_germplasm_groups(authorization, name=name, germplasm=germplasm, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->search_germplasm_groups: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **name** | **str**| Regex pattern for filtering by name | [optional] 
 **germplasm** | [**list[str]**](str.md)| Germplasm URIs | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[GermplasmGroupGetDTO]**](GermplasmGroupGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_germplasm**
> str update_germplasm(authorization, body=body, accept_language=accept_language)

Update a germplasm

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.GermplasmUpdateDTO() # GermplasmUpdateDTO | Germplasm description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a germplasm
    api_response = api_instance.update_germplasm(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->update_germplasm: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**GermplasmUpdateDTO**](GermplasmUpdateDTO.md)| Germplasm description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_germplasm_group**
> str update_germplasm_group(authorization, body=body, accept_language=accept_language)

Update a germplasm group

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.GermplasmApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.GermplasmGroupUpdateDTO() # GermplasmGroupUpdateDTO | Germplasm group description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a germplasm group
    api_response = api_instance.update_germplasm_group(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling GermplasmApi->update_germplasm_group: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**GermplasmGroupUpdateDTO**](GermplasmGroupUpdateDTO.md)| Germplasm group description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

