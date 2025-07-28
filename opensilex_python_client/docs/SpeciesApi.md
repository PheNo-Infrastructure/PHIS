# opensilex_swagger_client.SpeciesApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_all_species**](SpeciesApi.md#get_all_species) | **GET** /core/species | get species (no pagination)

# **get_all_species**
> list[SpeciesDTO] get_all_species(shared_resource_instance=shared_resource_instance, accept_language=accept_language)

get species (no pagination)

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.SpeciesApi()
shared_resource_instance = 'shared_resource_instance_example' # str | Shared resource instance URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # get species (no pagination)
    api_response = api_instance.get_all_species(shared_resource_instance=shared_resource_instance, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling SpeciesApi->get_all_species: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **shared_resource_instance** | **str**| Shared resource instance URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[SpeciesDTO]**](SpeciesDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

