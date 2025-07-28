# opensilex_swagger_client.StapleAPIApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**export_ontology_file**](StapleAPIApi.md#export_ontology_file) | **GET** /staple/ontology_file | Export ontology file for Staple API as turtle syntax
[**get_resource_graphs**](StapleAPIApi.md#get_resource_graphs) | **GET** /staple/resource_graph | Get all graphs associated with resources

# **export_ontology_file**
> export_ontology_file()

Export ontology file for Staple API as turtle syntax

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.StapleAPIApi()

try:
    # Export ontology file for Staple API as turtle syntax
    api_instance.export_ontology_file()
except ApiException as e:
    print("Exception when calling StapleAPIApi->export_ontology_file: %s\n" % e)
```

### Parameters
This endpoint does not need any parameter.

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_resource_graphs**
> get_resource_graphs()

Get all graphs associated with resources

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.StapleAPIApi()

try:
    # Get all graphs associated with resources
    api_instance.get_resource_graphs()
except ApiException as e:
    print("Exception when calling StapleAPIApi->get_resource_graphs: %s\n" % e)
```

### Parameters
This endpoint does not need any parameter.

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

