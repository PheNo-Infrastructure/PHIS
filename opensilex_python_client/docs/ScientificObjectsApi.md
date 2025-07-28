# opensilex_swagger_client.ScientificObjectsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**count_scientific_objects**](ScientificObjectsApi.md#count_scientific_objects) | **GET** /core/scientific_objects/count | Count scientific objects
[**create_scientific_object**](ScientificObjectsApi.md#create_scientific_object) | **POST** /core/scientific_objects | Create a scientific object for the given experiment
[**delete_scientific_object**](ScientificObjectsApi.md#delete_scientific_object) | **DELETE** /core/scientific_objects/{uri} | Delete a scientific object
[**export_csv**](ScientificObjectsApi.md#export_csv) | **POST** /core/scientific_objects/export | Export a given list of scientific object URIs to csv data file
[**export_geospatial2**](ScientificObjectsApi.md#export_geospatial2) | **POST** /core/scientific_objects/export_geospatial | Export a given list of scientific object URIs to shapefile or geojson
[**get_scientific_object_data_files_provenances**](ScientificObjectsApi.md#get_scientific_object_data_files_provenances) | **GET** /core/scientific_objects/{uri}/datafiles/provenances | Get provenances of datafiles linked to this scientific object
[**get_scientific_object_data_provenances**](ScientificObjectsApi.md#get_scientific_object_data_provenances) | **GET** /core/scientific_objects/{uri}/data/provenances | Get provenances of data that have been measured on this scientific object
[**get_scientific_object_detail**](ScientificObjectsApi.md#get_scientific_object_detail) | **GET** /core/scientific_objects/{uri} | Get scientific object detail
[**get_scientific_object_detail_by_experiments**](ScientificObjectsApi.md#get_scientific_object_detail_by_experiments) | **GET** /core/scientific_objects/{uri}/experiments | Get scientific object detail for each experiments, a null value for experiment in response means a properties defined outside of any experiment (shared object).
[**get_scientific_object_variables**](ScientificObjectsApi.md#get_scientific_object_variables) | **GET** /core/scientific_objects/{uri}/variables | Get variables measured on this scientific object
[**get_scientific_objects_children**](ScientificObjectsApi.md#get_scientific_objects_children) | **GET** /core/scientific_objects/children | Get list of scientific object children
[**get_scientific_objects_list_by_uris**](ScientificObjectsApi.md#get_scientific_objects_list_by_uris) | **POST** /core/scientific_objects/by_uris | Get scientific objet list of a given experiment URI
[**get_used_types**](ScientificObjectsApi.md#get_used_types) | **GET** /core/scientific_objects/used_types | get used scientific object types
[**import_csv1**](ScientificObjectsApi.md#import_csv1) | **POST** /core/scientific_objects/import | Import a CSV file for the given experiment URI and scientific object type.
[**search_scientific_objects**](ScientificObjectsApi.md#search_scientific_objects) | **GET** /core/scientific_objects | Search list of scientific objects
[**search_scientific_objects_with_geometry_list_by_uris**](ScientificObjectsApi.md#search_scientific_objects_with_geometry_list_by_uris) | **GET** /core/scientific_objects/geometry | Get scientific objet list with geometry of a given experiment URI
[**update_scientific_object**](ScientificObjectsApi.md#update_scientific_object) | **PUT** /core/scientific_objects | Update a scientific object for the given experiment
[**validate_csv3**](ScientificObjectsApi.md#validate_csv3) | **POST** /core/scientific_objects/import_validation | Validate a CSV file for the given experiment URI and scientific object type.

# **count_scientific_objects**
> int count_scientific_objects(authorization, experiment=experiment, accept_language=accept_language)

Count scientific objects

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
authorization = 'authorization_example' # str | Authentication token
experiment = 'experiment_example' # str | Experiment URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Count scientific objects
    api_response = api_instance.count_scientific_objects(authorization, experiment=experiment, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->count_scientific_objects: %s\n" % e)
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

# **create_scientific_object**
> str create_scientific_object(body, authorization, accept_language=accept_language)

Create a scientific object for the given experiment

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
body = opensilex_swagger_client.ScientificObjectCreationDTO() # ScientificObjectCreationDTO | Scientific object description
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create a scientific object for the given experiment
    api_response = api_instance.create_scientific_object(body, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->create_scientific_object: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | [**ScientificObjectCreationDTO**](ScientificObjectCreationDTO.md)| Scientific object description | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_scientific_object**
> str delete_scientific_object(uri, authorization, experiment=experiment, accept_language=accept_language)

Delete a scientific object

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
uri = 'uri_example' # str | scientific object URI
authorization = 'authorization_example' # str | Authentication token
experiment = 'experiment_example' # str | Experiment URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a scientific object
    api_response = api_instance.delete_scientific_object(uri, authorization, experiment=experiment, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->delete_scientific_object: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| scientific object URI | 
 **authorization** | **str**| Authentication token | 
 **experiment** | **str**| Experiment URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **export_csv**
> export_csv(authorization, body=body, accept_language=accept_language)

Export a given list of scientific object URIs to csv data file

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.ScientificObjectExportDTO() # ScientificObjectExportDTO | CSV export configuration (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Export a given list of scientific object URIs to csv data file
    api_instance.export_csv(authorization, body=body, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->export_csv: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**ScientificObjectExportDTO**](ScientificObjectExportDTO.md)| CSV export configuration | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **export_geospatial2**
> export_geospatial2(authorization, body=body, accept_language=accept_language, experiment=experiment, selected_props=selected_props, format=format, page_size=page_size)

Export a given list of scientific object URIs to shapefile or geojson

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
authorization = 'authorization_example' # str | Authentication token
body = [opensilex_swagger_client.GeometryDTO()] # list[GeometryDTO] | Scientific objects (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
experiment = 'experiment_example' # str | Experiment URI (optional)
selected_props = ['selected_props_example'] # list[str] | properties selected (optional)
format = 'format_example' # str | export format (shp/geojson) (optional)
page_size = 56 # int | Page size limited to 10,000 objects (optional)

try:
    # Export a given list of scientific object URIs to shapefile or geojson
    api_instance.export_geospatial2(authorization, body=body, accept_language=accept_language, experiment=experiment, selected_props=selected_props, format=format, page_size=page_size)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->export_geospatial2: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[GeometryDTO]**](GeometryDTO.md)| Scientific objects | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **experiment** | **str**| Experiment URI | [optional] 
 **selected_props** | [**list[str]**](str.md)| properties selected | [optional] 
 **format** | **str**| export format (shp/geojson) | [optional] 
 **page_size** | **int**| Page size limited to 10,000 objects | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_scientific_object_data_files_provenances**
> list[ProvenanceGetDTO] get_scientific_object_data_files_provenances(uri, authorization, accept_language=accept_language)

Get provenances of datafiles linked to this scientific object

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
uri = 'uri_example' # str | Scientific Object URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get provenances of datafiles linked to this scientific object
    api_response = api_instance.get_scientific_object_data_files_provenances(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_scientific_object_data_files_provenances: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Scientific Object URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ProvenanceGetDTO]**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_scientific_object_data_provenances**
> list[ProvenanceGetDTO] get_scientific_object_data_provenances(uri, authorization, accept_language=accept_language)

Get provenances of data that have been measured on this scientific object

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
uri = 'uri_example' # str | Scientific Object URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get provenances of data that have been measured on this scientific object
    api_response = api_instance.get_scientific_object_data_provenances(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_scientific_object_data_provenances: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Scientific Object URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ProvenanceGetDTO]**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_scientific_object_detail**
> ScientificObjectDetailDTO get_scientific_object_detail(uri, authorization, experiment=experiment, accept_language=accept_language)

Get scientific object detail

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
uri = 'uri_example' # str | scientific object URI
authorization = 'authorization_example' # str | Authentication token
experiment = 'experiment_example' # str | Experiment URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get scientific object detail
    api_response = api_instance.get_scientific_object_detail(uri, authorization, experiment=experiment, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_scientific_object_detail: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| scientific object URI | 
 **authorization** | **str**| Authentication token | 
 **experiment** | **str**| Experiment URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**ScientificObjectDetailDTO**](ScientificObjectDetailDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_scientific_object_detail_by_experiments**
> list[ScientificObjectDetailByExperimentsDTO] get_scientific_object_detail_by_experiments(uri, authorization, accept_language=accept_language)

Get scientific object detail for each experiments, a null value for experiment in response means a properties defined outside of any experiment (shared object).

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
uri = 'uri_example' # str | scientific object URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get scientific object detail for each experiments, a null value for experiment in response means a properties defined outside of any experiment (shared object).
    api_response = api_instance.get_scientific_object_detail_by_experiments(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_scientific_object_detail_by_experiments: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| scientific object URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ScientificObjectDetailByExperimentsDTO]**](ScientificObjectDetailByExperimentsDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_scientific_object_variables**
> list[NamedResourceDTO] get_scientific_object_variables(uri, authorization, accept_language=accept_language)

Get variables measured on this scientific object

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
uri = 'uri_example' # str | Scientific Object URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get variables measured on this scientific object
    api_response = api_instance.get_scientific_object_variables(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_scientific_object_variables: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Scientific Object URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[NamedResourceDTO]**](NamedResourceDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_scientific_objects_children**
> list[ScientificObjectNodeWithChildrenDTO] get_scientific_objects_children(authorization, parent=parent, experiment=experiment, rdf_types=rdf_types, name=name, factor_levels=factor_levels, facility=facility, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Get list of scientific object children

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
authorization = 'authorization_example' # str | Authentication token
parent = 'parent_example' # str | Parent object URI (optional)
experiment = 'experiment_example' # str | Experiment URI (optional)
rdf_types = ['rdf_types_example'] # list[str] | RDF type filter (optional)
name = '.*' # str | Regex pattern for filtering by name (optional) (default to .*)
factor_levels = ['factor_levels_example'] # list[str] | Factor levels URI (optional)
facility = 'facility_example' # str | Facility (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get list of scientific object children
    api_response = api_instance.get_scientific_objects_children(authorization, parent=parent, experiment=experiment, rdf_types=rdf_types, name=name, factor_levels=factor_levels, facility=facility, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_scientific_objects_children: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **parent** | **str**| Parent object URI | [optional] 
 **experiment** | **str**| Experiment URI | [optional] 
 **rdf_types** | [**list[str]**](str.md)| RDF type filter | [optional] 
 **name** | **str**| Regex pattern for filtering by name | [optional] [default to .*]
 **factor_levels** | [**list[str]**](str.md)| Factor levels URI | [optional] 
 **facility** | **str**| Facility | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ScientificObjectNodeWithChildrenDTO]**](ScientificObjectNodeWithChildrenDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_scientific_objects_list_by_uris**
> list[ScientificObjectNodeDTO] get_scientific_objects_list_by_uris(authorization, body=body, accept_language=accept_language, experiment=experiment)

Get scientific objet list of a given experiment URI

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Scientific object uris (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
experiment = 'experiment_example' # str | Experiment URI (optional)

try:
    # Get scientific objet list of a given experiment URI
    api_response = api_instance.get_scientific_objects_list_by_uris(authorization, body=body, accept_language=accept_language, experiment=experiment)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_scientific_objects_list_by_uris: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Scientific object uris | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **experiment** | **str**| Experiment URI | [optional] 

### Return type

[**list[ScientificObjectNodeDTO]**](ScientificObjectNodeDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_used_types**
> list[ListItemDTO] get_used_types(authorization, experiment=experiment, accept_language=accept_language)

get used scientific object types

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
authorization = 'authorization_example' # str | Authentication token
experiment = 'experiment_example' # str | Experiment URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # get used scientific object types
    api_response = api_instance.get_used_types(authorization, experiment=experiment, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->get_used_types: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **experiment** | **str**| Experiment URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ListItemDTO]**](ListItemDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **import_csv1**
> CSVValidationDTO import_csv1(description, file, authorization, accept_language=accept_language)

Import a CSV file for the given experiment URI and scientific object type.

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
description = 'description_example' # str | 
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Import a CSV file for the given experiment URI and scientific object type.
    api_response = api_instance.import_csv1(description, file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->import_csv1: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **description** | **str**|  | 
 **file** | **str**|  | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**CSVValidationDTO**](CSVValidationDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_scientific_objects**
> list[ScientificObjectNodeDTO] search_scientific_objects(authorization, experiment=experiment, rdf_types=rdf_types, name=name, parent=parent, germplasms=germplasms, factor_levels=factor_levels, facility=facility, variables=variables, devices=devices, existence_date=existence_date, creation_date=creation_date, criteria_on_data=criteria_on_data, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search list of scientific objects

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
authorization = 'authorization_example' # str | Authentication token
experiment = 'experiment_example' # str | Experiment URI (optional)
rdf_types = ['rdf_types_example'] # list[str] | RDF type filter (optional)
name = '.*' # str | Regex pattern for filtering by name (optional) (default to .*)
parent = 'parent_example' # str | Parent URI (optional)
germplasms = ['germplasms_example'] # list[str] | Germplasm URIs (optional)
factor_levels = ['factor_levels_example'] # list[str] | Factor levels URI (optional)
facility = 'facility_example' # str | Facility (optional)
variables = ['variables_example'] # list[str] | Variables URI (optional)
devices = ['devices_example'] # list[str] | Devices URI (optional)
existence_date = '2013-10-20' # date | Date to filter object existence (optional)
creation_date = '2013-10-20' # date | Date to filter object creation (optional)
criteria_on_data = 'criteria_on_data_example' # str | A CriteriaDTO to be applied to data, retain objects that are targets in returned data (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search list of scientific objects
    api_response = api_instance.search_scientific_objects(authorization, experiment=experiment, rdf_types=rdf_types, name=name, parent=parent, germplasms=germplasms, factor_levels=factor_levels, facility=facility, variables=variables, devices=devices, existence_date=existence_date, creation_date=creation_date, criteria_on_data=criteria_on_data, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->search_scientific_objects: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **experiment** | **str**| Experiment URI | [optional] 
 **rdf_types** | [**list[str]**](str.md)| RDF type filter | [optional] 
 **name** | **str**| Regex pattern for filtering by name | [optional] [default to .*]
 **parent** | **str**| Parent URI | [optional] 
 **germplasms** | [**list[str]**](str.md)| Germplasm URIs | [optional] 
 **factor_levels** | [**list[str]**](str.md)| Factor levels URI | [optional] 
 **facility** | **str**| Facility | [optional] 
 **variables** | [**list[str]**](str.md)| Variables URI | [optional] 
 **devices** | [**list[str]**](str.md)| Devices URI | [optional] 
 **existence_date** | **date**| Date to filter object existence | [optional] 
 **creation_date** | **date**| Date to filter object creation | [optional] 
 **criteria_on_data** | **str**| A CriteriaDTO to be applied to data, retain objects that are targets in returned data | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ScientificObjectNodeDTO]**](ScientificObjectNodeDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_scientific_objects_with_geometry_list_by_uris**
> list[ScientificObjectNodeDTO] search_scientific_objects_with_geometry_list_by_uris(experiment, authorization, start_date=start_date, end_date=end_date, accept_language=accept_language)

Get scientific objet list with geometry of a given experiment URI

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
experiment = 'experiment_example' # str | Context URI
authorization = 'authorization_example' # str | Authentication token
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get scientific objet list with geometry of a given experiment URI
    api_response = api_instance.search_scientific_objects_with_geometry_list_by_uris(experiment, authorization, start_date=start_date, end_date=end_date, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->search_scientific_objects_with_geometry_list_by_uris: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **experiment** | **str**| Context URI | 
 **authorization** | **str**| Authentication token | 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ScientificObjectNodeDTO]**](ScientificObjectNodeDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_scientific_object**
> str update_scientific_object(body, authorization, accept_language=accept_language)

Update a scientific object for the given experiment

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
body = opensilex_swagger_client.ScientificObjectUpdateDTO() # ScientificObjectUpdateDTO | Scientific object description
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a scientific object for the given experiment
    api_response = api_instance.update_scientific_object(body, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->update_scientific_object: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | [**ScientificObjectUpdateDTO**](ScientificObjectUpdateDTO.md)| Scientific object description | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **validate_csv3**
> CSVValidationDTO validate_csv3(description, file, authorization, accept_language=accept_language)

Validate a CSV file for the given experiment URI and scientific object type.

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.ScientificObjectsApi()
description = 'description_example' # str | 
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Validate a CSV file for the given experiment URI and scientific object type.
    api_response = api_instance.validate_csv3(description, file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ScientificObjectsApi->validate_csv3: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **description** | **str**|  | 
 **file** | **str**|  | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**CSVValidationDTO**](CSVValidationDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

