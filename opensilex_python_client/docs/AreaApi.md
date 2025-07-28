# opensilex_swagger_client.AreaApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**create_area**](AreaApi.md#create_area) | **POST** /core/area | Add an area
[**delete_area**](AreaApi.md#delete_area) | **DELETE** /core/area/{uri} | Delete an area
[**export_geospatial**](AreaApi.md#export_geospatial) | **POST** /core/area/export_geospatial | Export a given list of areas URIs to shapefile
[**get_by_uri**](AreaApi.md#get_by_uri) | **GET** /core/area/{uri} | Get an area
[**search_intersects**](AreaApi.md#search_intersects) | **POST** /core/area/intersects | Get area whose geometry corresponds to the Intersections
[**update_area**](AreaApi.md#update_area) | **PUT** /core/area | Update an area

# **create_area**
> str create_area(authorization, body=body, accept_language=accept_language)

Add an area

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AreaApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.AreaCreationDTO() # AreaCreationDTO | Area description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Add an area
    api_response = api_instance.create_area(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AreaApi->create_area: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**AreaCreationDTO**](AreaCreationDTO.md)| Area description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_area**
> str delete_area(uri, authorization, accept_language=accept_language)

Delete an area

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AreaApi()
uri = 'uri_example' # str | Area URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete an area
    api_response = api_instance.delete_area(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AreaApi->delete_area: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Area URI | 
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

# **export_geospatial**
> export_geospatial(authorization, body=body, accept_language=accept_language, selected_props=selected_props, format=format, page_size=page_size)

Export a given list of areas URIs to shapefile

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AreaApi()
authorization = 'authorization_example' # str | Authentication token
body = [opensilex_swagger_client.GeometryDTO()] # list[GeometryDTO] | Areas (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
selected_props = ['selected_props_example'] # list[str] | properties selected (optional)
format = 'format_example' # str | export format (shp/geojson) (optional)
page_size = 56 # int | Page size limited to 10,000 objects (optional)

try:
    # Export a given list of areas URIs to shapefile
    api_instance.export_geospatial(authorization, body=body, accept_language=accept_language, selected_props=selected_props, format=format, page_size=page_size)
except ApiException as e:
    print("Exception when calling AreaApi->export_geospatial: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[GeometryDTO]**](GeometryDTO.md)| Areas | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
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

# **get_by_uri**
> AreaGetDTO get_by_uri(uri, authorization, accept_language=accept_language)

Get an area

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AreaApi()
uri = 'uri_example' # str | area URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get an area
    api_response = api_instance.get_by_uri(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AreaApi->get_by_uri: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| area URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**AreaGetDTO**](AreaGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_intersects**
> list[AreaGetDTO] search_intersects(body, authorization, accept_language=accept_language, start=start, end=end)

Get area whose geometry corresponds to the Intersections

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AreaApi()
body = opensilex_swagger_client.GeoJsonObject() # GeoJsonObject | geometry GeoJSON
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)
start = 'start_example' # str | Start date : match temporal area after the given start date (optional)
end = 'end_example' # str | End date : match temporal area before the given end date (optional)

try:
    # Get area whose geometry corresponds to the Intersections
    api_response = api_instance.search_intersects(body, authorization, accept_language=accept_language, start=start, end=end)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AreaApi->search_intersects: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | [**GeoJsonObject**](GeoJsonObject.md)| geometry GeoJSON | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 
 **start** | **str**| Start date : match temporal area after the given start date | [optional] 
 **end** | **str**| End date : match temporal area before the given end date | [optional] 

### Return type

[**list[AreaGetDTO]**](AreaGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_area**
> str update_area(body, authorization, accept_language=accept_language)

Update an area

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.AreaApi()
body = opensilex_swagger_client.AreaUpdateDTO() # AreaUpdateDTO | Area description
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update an area
    api_response = api_instance.update_area(body, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling AreaApi->update_area: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | [**AreaUpdateDTO**](AreaUpdateDTO.md)| Area description | 
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

