# opensilex_swagger_client.FactorsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**count_factors**](FactorsApi.md#count_factors) | **GET** /core/experiments/factors/count | Count factors
[**create_factor**](FactorsApi.md#create_factor) | **POST** /core/experiments/factors | Create a factor
[**delete_factor**](FactorsApi.md#delete_factor) | **DELETE** /core/experiments/factors/{uri} | Delete a factor
[**delete_factor_level**](FactorsApi.md#delete_factor_level) | **DELETE** /core/experiments/factors/levels/{uri} | Delete a factor level
[**get_factor_associated_experiments**](FactorsApi.md#get_factor_associated_experiments) | **GET** /core/experiments/factors/{uri}/experiments | Get factor associated experiments
[**get_factor_by_uri**](FactorsApi.md#get_factor_by_uri) | **GET** /core/experiments/factors/{uri} | Get a factor
[**get_factor_level**](FactorsApi.md#get_factor_level) | **GET** /core/experiments/factors/levels/{uri} | Get a factor level
[**get_factor_level_detail**](FactorsApi.md#get_factor_level_detail) | **GET** /core/experiments/factors/levels/{uri}/details | Get a factor level
[**get_factor_levels**](FactorsApi.md#get_factor_levels) | **GET** /core/experiments/factors/{uri}/levels | Get factor levels
[**get_factors_by_uris**](FactorsApi.md#get_factors_by_uris) | **GET** /core/experiments/factors/by_uris | Get a list of factors by their URIs
[**search_categories**](FactorsApi.md#search_categories) | **GET** /core/experiments/factors/categories | Search categories
[**search_factor_levels**](FactorsApi.md#search_factor_levels) | **GET** /core/experiments/factors/factor_levels | Search factors levels
[**search_factors**](FactorsApi.md#search_factors) | **GET** /core/experiments/factors | Search factors
[**update_factor**](FactorsApi.md#update_factor) | **PUT** /core/experiments/factors | Update a factor

# **count_factors**
> int count_factors(authorization, experiment=experiment, accept_language=accept_language)

Count factors

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
authorization = 'authorization_example' # str | Authentication token
experiment = 'experiment_example' # str | Experiment URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Count factors
    api_response = api_instance.count_factors(authorization, experiment=experiment, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->count_factors: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **experiment** | **str**| Experiment URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**int**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_factor**
> create_factor(authorization, body=body, accept_language=accept_language)

Create a factor

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.FactorCreationDTO() # FactorCreationDTO | Factor description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create a factor
    api_instance.create_factor(authorization, body=body, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling FactorsApi->create_factor: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**FactorCreationDTO**](FactorCreationDTO.md)| Factor description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_factor**
> str delete_factor(uri, authorization, accept_language=accept_language)

Delete a factor

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uri = 'uri_example' # str | Factor URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a factor
    api_response = api_instance.delete_factor(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->delete_factor: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Factor URI | 
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

# **delete_factor_level**
> str delete_factor_level(uri, authorization, accept_language=accept_language)

Delete a factor level

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uri = 'uri_example' # str | Factor level URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a factor level
    api_response = api_instance.delete_factor_level(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->delete_factor_level: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Factor level URI | 
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

# **get_factor_associated_experiments**
> list[ExperimentGetListDTO] get_factor_associated_experiments(uri, authorization, accept_language=accept_language)

Get factor associated experiments

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uri = 'uri_example' # str | Factor URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get factor associated experiments
    api_response = api_instance.get_factor_associated_experiments(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->get_factor_associated_experiments: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Factor URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ExperimentGetListDTO]**](ExperimentGetListDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_factor_by_uri**
> FactorDetailsGetDTO get_factor_by_uri(uri, authorization, accept_language=accept_language)

Get a factor

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uri = 'uri_example' # str | Factor URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a factor
    api_response = api_instance.get_factor_by_uri(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->get_factor_by_uri: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Factor URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**FactorDetailsGetDTO**](FactorDetailsGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_factor_level**
> FactorLevelGetDTO get_factor_level(uri, authorization, accept_language=accept_language)

Get a factor level

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uri = 'uri_example' # str | Factor Level URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a factor level
    api_response = api_instance.get_factor_level(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->get_factor_level: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Factor Level URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**FactorLevelGetDTO**](FactorLevelGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_factor_level_detail**
> FactorLevelGetDetailDTO get_factor_level_detail(uri, authorization, accept_language=accept_language)

Get a factor level

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uri = 'uri_example' # str | Factor Level URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a factor level
    api_response = api_instance.get_factor_level_detail(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->get_factor_level_detail: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Factor Level URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**FactorLevelGetDetailDTO**](FactorLevelGetDetailDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_factor_levels**
> list[FactorLevelGetDTO] get_factor_levels(uri, authorization, accept_language=accept_language)

Get factor levels

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uri = 'uri_example' # str | Factor URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get factor levels
    api_response = api_instance.get_factor_levels(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->get_factor_levels: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Factor URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[FactorLevelGetDTO]**](FactorLevelGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_factors_by_uris**
> list[FactorGetDTO] get_factors_by_uris(uris, authorization, accept_language=accept_language)

Get a list of factors by their URIs

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
uris = ['uris_example'] # list[str] | Factors URIs
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a list of factors by their URIs
    api_response = api_instance.get_factors_by_uris(uris, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->get_factors_by_uris: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uris** | [**list[str]**](str.md)| Factors URIs | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[FactorGetDTO]**](FactorGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_categories**
> list[FactorCategoryGetDTO] search_categories(name=name, order_by=order_by, accept_language=accept_language)

Search categories

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
name = 'name_example' # str | Category name regex pattern (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search categories
    api_response = api_instance.search_categories(name=name, order_by=order_by, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->search_categories: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **name** | **str**| Category name regex pattern | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[FactorCategoryGetDTO]**](FactorCategoryGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_factor_levels**
> list[FactorDetailsGetDTO] search_factor_levels(authorization, name=name, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search factors levels

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
authorization = 'authorization_example' # str | Authentication token
name = 'name_example' # str | Regex pattern for filtering on name (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search factors levels
    api_response = api_instance.search_factor_levels(authorization, name=name, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->search_factor_levels: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **name** | **str**| Regex pattern for filtering on name | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[FactorDetailsGetDTO]**](FactorDetailsGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_factors**
> list[FactorGetDTO] search_factors(authorization, name=name, description=description, category=category, experiment=experiment, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search factors

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
authorization = 'authorization_example' # str | Authentication token
name = 'name_example' # str | Regex pattern for filtering on name (optional)
description = 'description_example' # str | Regex pattern for filtering on description (optional)
category = 'category_example' # str | Filter by category of a factor (optional)
experiment = 'experiment_example' # str | Filter by experiment (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search factors
    api_response = api_instance.search_factors(authorization, name=name, description=description, category=category, experiment=experiment, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->search_factors: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **name** | **str**| Regex pattern for filtering on name | [optional] 
 **description** | **str**| Regex pattern for filtering on description | [optional] 
 **category** | **str**| Filter by category of a factor | [optional] 
 **experiment** | **str**| Filter by experiment | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[FactorGetDTO]**](FactorGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_factor**
> str update_factor(authorization, body=body, accept_language=accept_language)

Update a factor

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.FactorsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.FactorUpdateDTO() # FactorUpdateDTO | Factor description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a factor
    api_response = api_instance.update_factor(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling FactorsApi->update_factor: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**FactorUpdateDTO**](FactorUpdateDTO.md)| Factor description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

