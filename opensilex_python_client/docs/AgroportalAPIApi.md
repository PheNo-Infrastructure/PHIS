# opensilex_swagger_client.AgroportalAPIApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_agroportal_ontologies**](AgroportalAPIApi.md#get_agroportal_ontologies) | **GET** /core/agroportal/ontologies | Get ontologies from agroportal
[**ping_agroportal**](AgroportalAPIApi.md#ping_agroportal) | **GET** /core/agroportal/ping | Ping agroportal server
[**search_through_agroportal**](AgroportalAPIApi.md#search_through_agroportal) | **GET** /core/agroportal/search | Search through agroportal

# **get_agroportal_ontologies**
> list[OntologyAgroportalDTO] get_agroportal_ontologies(authorization, name=name, ontologies=ontologies, accept_language=accept_language)

Get ontologies from agroportal

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AgroportalAPIApi()
authorization = 'authorization_example' # str | Authentication token
name = '.*' # str | Name (regex) (optional) (default to .*)
ontologies = ['ontologies_example'] # list[str] | List of ontologies to get (acronyms) (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get ontologies from agroportal
    api_response = api_instance.get_agroportal_ontologies(authorization, name=name, ontologies=ontologies, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AgroportalAPIApi->get_agroportal_ontologies: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **name** | **str**| Name (regex) | [optional] [default to .*]
 **ontologies** | [**list[str]**](str.md)| List of ontologies to get (acronyms) | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[OntologyAgroportalDTO]**](OntologyAgroportalDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **ping_agroportal**
> bool ping_agroportal(authorization, timeout=timeout, accept_language=accept_language)

Ping agroportal server

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AgroportalAPIApi()
authorization = 'authorization_example' # str | Authentication token
timeout = 789 # int | Timeout (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Ping agroportal server
    api_response = api_instance.ping_agroportal(authorization, timeout=timeout, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AgroportalAPIApi->ping_agroportal: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **timeout** | **int**| Timeout | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**bool**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_through_agroportal**
> list[AgroportalTermDTO] search_through_agroportal(authorization, name=name, ontologies=ontologies, accept_language=accept_language)

Search through agroportal

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AgroportalAPIApi()
authorization = 'authorization_example' # str | Authentication token
name = 'name_example' # str | Name (regex) (optional)
ontologies = ['ontologies_example'] # list[str] | List of ontologies (acronym) (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search through agroportal
    api_response = api_instance.search_through_agroportal(authorization, name=name, ontologies=ontologies, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AgroportalAPIApi->search_through_agroportal: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **name** | **str**| Name (regex) | [optional] 
 **ontologies** | [**list[str]**](str.md)| List of ontologies (acronym) | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[AgroportalTermDTO]**](AgroportalTermDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

