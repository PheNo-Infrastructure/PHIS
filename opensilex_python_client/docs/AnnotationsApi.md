# opensilex_swagger_client.AnnotationsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**count_annotations**](AnnotationsApi.md#count_annotations) | **GET** /core/annotations/count | Count annotations
[**create_annotation**](AnnotationsApi.md#create_annotation) | **POST** /core/annotations | Create an annotation
[**delete_annotation**](AnnotationsApi.md#delete_annotation) | **DELETE** /core/annotations/{uri} | Delete an annotation
[**get_annotation**](AnnotationsApi.md#get_annotation) | **GET** /core/annotations/{uri} | Get an annotation
[**search_annotations**](AnnotationsApi.md#search_annotations) | **GET** /core/annotations | Search annotations
[**search_motivations**](AnnotationsApi.md#search_motivations) | **GET** /core/annotations/motivations | Search motivations
[**update_annotation**](AnnotationsApi.md#update_annotation) | **PUT** /core/annotations | Update an annotation

# **count_annotations**
> int count_annotations(authorization, target=target, accept_language=accept_language)

Count annotations

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AnnotationsApi()
authorization = 'authorization_example' # str | Authentication token
target = 'target_example' # str | Target URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Count annotations
    api_response = api_instance.count_annotations(authorization, target=target, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AnnotationsApi->count_annotations: %s\n" % e)
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

# **create_annotation**
> str create_annotation(authorization, body=body, accept_language=accept_language)

Create an annotation

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AnnotationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.AnnotationCreationDTO() # AnnotationCreationDTO |  (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create an annotation
    api_response = api_instance.create_annotation(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AnnotationsApi->create_annotation: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**AnnotationCreationDTO**](AnnotationCreationDTO.md)|  | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_annotation**
> str delete_annotation(uri, authorization, accept_language=accept_language)

Delete an annotation

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AnnotationsApi()
uri = 'uri_example' # str | Annotation URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete an annotation
    api_response = api_instance.delete_annotation(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AnnotationsApi->delete_annotation: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Annotation URI | 
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

# **get_annotation**
> AnnotationGetDTO get_annotation(uri, authorization, accept_language=accept_language)

Get an annotation

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AnnotationsApi()
uri = 'uri_example' # str | Event URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get an annotation
    api_response = api_instance.get_annotation(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AnnotationsApi->get_annotation: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Event URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**AnnotationGetDTO**](AnnotationGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_annotations**
> list[AnnotationGetDTO] search_annotations(authorization, description=description, target=target, motivation=motivation, author=author, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search annotations

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AnnotationsApi()
authorization = 'authorization_example' # str | Authentication token
description = 'description_example' # str | Description (regex) (optional)
target = 'target_example' # str | Target URI (optional)
motivation = 'motivation_example' # str | Motivation URI (optional)
author = 'author_example' # str | Author URI (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search annotations
    api_response = api_instance.search_annotations(authorization, description=description, target=target, motivation=motivation, author=author, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AnnotationsApi->search_annotations: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **description** | **str**| Description (regex) | [optional] 
 **target** | **str**| Target URI | [optional] 
 **motivation** | **str**| Motivation URI | [optional] 
 **author** | **str**| Author URI | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[AnnotationGetDTO]**](AnnotationGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_motivations**
> list[MotivationGetDTO] search_motivations(authorization, name=name, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search motivations

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AnnotationsApi()
authorization = 'authorization_example' # str | Authentication token
name = 'name_example' # str | Motivation name regex pattern (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search motivations
    api_response = api_instance.search_motivations(authorization, name=name, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AnnotationsApi->search_motivations: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **name** | **str**| Motivation name regex pattern | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[MotivationGetDTO]**](MotivationGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_annotation**
> str update_annotation(authorization, body=body, accept_language=accept_language)

Update an annotation

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AnnotationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.AnnotationUpdateDTO() # AnnotationUpdateDTO | Annotation description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update an annotation
    api_response = api_instance.update_annotation(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AnnotationsApi->update_annotation: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**AnnotationUpdateDTO**](AnnotationUpdateDTO.md)| Annotation description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

