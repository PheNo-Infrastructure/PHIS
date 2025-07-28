# opensilex_swagger_client.DocumentsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**count_documents**](DocumentsApi.md#count_documents) | **GET** /core/documents/count | Count documents
[**create_document**](DocumentsApi.md#create_document) | **POST** /core/documents | Add a document
[**delete_document**](DocumentsApi.md#delete_document) | **DELETE** /core/documents/{uri} | Delete a document
[**get_document_file**](DocumentsApi.md#get_document_file) | **GET** /core/documents/{uri} | Get document
[**get_document_metadata**](DocumentsApi.md#get_document_metadata) | **GET** /core/documents/{uri}/description | Get document&#x27;s description
[**search_documents**](DocumentsApi.md#search_documents) | **GET** /core/documents | Search documents
[**update_document**](DocumentsApi.md#update_document) | **PUT** /core/documents | Update document&#x27;s description

# **count_documents**
> int count_documents(authorization, target=target, accept_language=accept_language)

Count documents

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DocumentsApi()
authorization = 'authorization_example' # str | Authentication token
target = 'target_example' # str | Target URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Count documents
    api_response = api_instance.count_documents(authorization, target=target, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DocumentsApi->count_documents: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **target** | **str**| Target URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**int**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_document**
> str create_document(description, file, authorization, accept_language=accept_language)

Add a document

{ uri: http://opensilex.dev/set/documents#ProtocolExperimental, identifier: doi:10.1340/309registries, rdf_type: http://www.opensilex.org/vocabulary/oeso#ScientificDocument, title: title, date: 2020-06-01, description: description, targets: http://opensilex.dev/opensilex/id/variables/v001, authors: Author name, language: fr, format: jpg, deprecated: false, keywords: keywords}

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DocumentsApi()
description = 'description_example' # str | 
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Add a document
    api_response = api_instance.create_document(description, file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DocumentsApi->create_document: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **description** | **str**|  | 
 **file** | **str**|  | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_document**
> str delete_document(uri, authorization, accept_language=accept_language)

Delete a document

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DocumentsApi()
uri = 'uri_example' # str | Document URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a document
    api_response = api_instance.delete_document(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DocumentsApi->delete_document: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Document URI | 
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

# **get_document_file**
> get_document_file(uri, authorization, accept_language=accept_language)

Get document

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DocumentsApi()
uri = 'uri_example' # str | Document URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get document
    api_instance.get_document_file(uri, authorization, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling DocumentsApi->get_document_file: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Document URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/octet-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_document_metadata**
> DocumentGetDTO get_document_metadata(uri, authorization, accept_language=accept_language)

Get document's description

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DocumentsApi()
uri = 'uri_example' # str | Document URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get document's description
    api_response = api_instance.get_document_metadata(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DocumentsApi->get_document_metadata: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Document URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**DocumentGetDTO**](DocumentGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_documents**
> list[DocumentGetDTO] search_documents(authorization, rdf_type=rdf_type, title=title, _date=_date, targets=targets, authors=authors, keyword=keyword, multiple=multiple, deprecated=deprecated, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search documents

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DocumentsApi()
authorization = 'authorization_example' # str | Authentication token
rdf_type = 'rdf_type_example' # str | Search by type (optional)
title = 'title_example' # str | Regex pattern for filtering list by title (optional)
_date = '_date_example' # str | Regex pattern for filtering list by date (optional)
targets = 'targets_example' # str | Search by targets (optional)
authors = 'authors_example' # str | Regex pattern for filtering list by author (optional)
keyword = 'keyword_example' # str | Regex pattern for filtering list by keyword (optional)
multiple = 'multiple_example' # str | Regex pattern for filtering list by keyword or title (optional)
deprecated = 'deprecated_example' # str | Search deprecated file (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldTitle=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search documents
    api_response = api_instance.search_documents(authorization, rdf_type=rdf_type, title=title, _date=_date, targets=targets, authors=authors, keyword=keyword, multiple=multiple, deprecated=deprecated, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DocumentsApi->search_documents: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **rdf_type** | **str**| Search by type | [optional] 
 **title** | **str**| Regex pattern for filtering list by title | [optional] 
 **_date** | **str**| Regex pattern for filtering list by date | [optional] 
 **targets** | **str**| Search by targets | [optional] 
 **authors** | **str**| Regex pattern for filtering list by author | [optional] 
 **keyword** | **str**| Regex pattern for filtering list by keyword | [optional] 
 **multiple** | **str**| Regex pattern for filtering list by keyword or title | [optional] 
 **deprecated** | **str**| Search deprecated file | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldTitle&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[DocumentGetDTO]**](DocumentGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_document**
> str update_document(description, authorization, accept_language=accept_language)

Update document's description

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DocumentsApi()
description = 'description_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update document's description
    api_response = api_instance.update_document(description, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DocumentsApi->update_document: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **description** | **str**|  | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

