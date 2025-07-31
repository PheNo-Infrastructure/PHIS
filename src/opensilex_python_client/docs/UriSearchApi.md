# opensilex_swagger_client.UriSearchApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**search_by_uri**](UriSearchApi.md#search_by_uri) | **GET** /core/uri_search/{uri} | Get a list of objects that match the passed URI

# **search_by_uri**
> URIGlobalSearchDTO search_by_uri(uri, authorization, accept_language=accept_language)

Get a list of objects that match the passed URI

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.UriSearchApi()
uri = 'uri_example' # str | URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a list of objects that match the passed URI
    api_response = api_instance.search_by_uri(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling UriSearchApi->search_by_uri: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**URIGlobalSearchDTO**](URIGlobalSearchDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

