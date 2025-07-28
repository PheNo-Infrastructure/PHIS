# opensilex_swagger_client.DataApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**add_list_data**](DataApi.md#add_list_data) | **POST** /core/data | Add data
[**count_data**](DataApi.md#count_data) | **POST** /core/data/count | Count data
[**count_datafiles**](DataApi.md#count_datafiles) | **GET** /core/datafiles/count | Count datafiles
[**create_provenance**](DataApi.md#create_provenance) | **POST** /core/provenances | Add a provenance
[**delete_data**](DataApi.md#delete_data) | **DELETE** /core/data/{uri} | Delete data
[**delete_data_on_search**](DataApi.md#delete_data_on_search) | **DELETE** /core/data | Delete data on criteria
[**delete_provenance**](DataApi.md#delete_provenance) | **DELETE** /core/provenances/{uri} | Delete a provenance that doesn&#x27;t describe data
[**export_data**](DataApi.md#export_data) | **GET** /core/data/export | Export data
[**export_data1**](DataApi.md#export_data1) | **POST** /core/data/export | Export data
[**get_data**](DataApi.md#get_data) | **GET** /core/data/{uri} | Get data
[**get_data_file**](DataApi.md#get_data_file) | **GET** /core/datafiles/{uri} | Get a data file
[**get_data_file_description**](DataApi.md#get_data_file_description) | **GET** /core/datafiles/{uri}/description | Get a data file description
[**get_data_file_descriptions_by_search**](DataApi.md#get_data_file_descriptions_by_search) | **GET** /core/datafiles | Search data files
[**get_data_file_descriptions_by_targets**](DataApi.md#get_data_file_descriptions_by_targets) | **POST** /core/datafiles/by_targets | Search data files for a large list of targets 
[**get_data_list_by_targets**](DataApi.md#get_data_list_by_targets) | **POST** /core/data/by_targets | Search data for a large list of targets
[**get_data_series_by_facility**](DataApi.md#get_data_series_by_facility) | **GET** /core/data/data_serie/facility | Get all data series associated with a facility
[**get_datafiles_provenances**](DataApi.md#get_datafiles_provenances) | **GET** /core/datafiles/provenances | Search provenances linked to datafiles
[**get_datafiles_provenances_by_targets**](DataApi.md#get_datafiles_provenances_by_targets) | **POST** /core/datafiles/provenances/by_targets | Search provenances linked to datafiles for a large list of targets
[**get_mathematical_operators**](DataApi.md#get_mathematical_operators) | **GET** /core/data/mathematicalOperators | Get mathematical operators
[**get_pictures_thumbnails**](DataApi.md#get_pictures_thumbnails) | **GET** /core/datafiles/{uri}/thumbnail | Get a picture thumbnail
[**get_provenance**](DataApi.md#get_provenance) | **GET** /core/provenances/{uri} | Get a provenance
[**get_provenances_by_uris**](DataApi.md#get_provenances_by_uris) | **GET** /core/provenances/by_uris | Get a list of provenances by their URIs
[**get_used_provenances**](DataApi.md#get_used_provenances) | **GET** /core/data/provenances | Search provenances linked to data
[**get_used_provenances_by_targets**](DataApi.md#get_used_provenances_by_targets) | **POST** /core/data/provenances/by_targets | Search provenances linked to data for a large list of targets
[**get_used_variables**](DataApi.md#get_used_variables) | **GET** /core/data/variables | Get variables linked to data
[**import_csv_data**](DataApi.md#import_csv_data) | **POST** /core/data/import | Import a CSV file for the given provenanceURI
[**post_data_file**](DataApi.md#post_data_file) | **POST** /core/datafiles | Add a data file
[**post_data_file_paths**](DataApi.md#post_data_file_paths) | **POST** /core/datafiles/description | Describe datafiles and give their relative paths in the configured storage system. In the case of already stored datafiles.
[**search_data_list**](DataApi.md#search_data_list) | **GET** /core/data | Search data
[**search_data_list_by_targets**](DataApi.md#search_data_list_by_targets) | **POST** /core/data/search | Search data for a large list of targets
[**search_provenance**](DataApi.md#search_provenance) | **GET** /core/provenances | Get provenances
[**update**](DataApi.md#update) | **PUT** /core/data | Update data
[**update_confidence**](DataApi.md#update_confidence) | **PUT** /core/data/{uri}/confidence | Update confidence index
[**update_provenance**](DataApi.md#update_provenance) | **PUT** /core/provenances | Update a provenance
[**validate_csv**](DataApi.md#validate_csv) | **POST** /core/data/import_validation | Import a CSV file for the given provenanceURI.

# **add_list_data**
> str add_list_data(authorization, body=body, accept_language=accept_language)

Add data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = [opensilex_swagger_client.DataCreationDTO()] # list[DataCreationDTO] | Data description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Add data
    api_response = api_instance.add_list_data(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->add_list_data: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[DataCreationDTO]**](DataCreationDTO.md)| Data description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **count_data**
> int count_data(authorization, body=body, accept_language=accept_language, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, operators=operators, group_of_germplasm=group_of_germplasm, germplasm_uris=germplasm_uris, count_limit=count_limit)

Count data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Targets uris, can be an empty array but can't be null (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
timezone = 'timezone_example' # str | Precise the timezone corresponding to the given dates (optional)
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
variables = ['variables_example'] # list[str] | Search by variables uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
min_confidence = 3.4 # float | Search by minimal confidence index (optional)
max_confidence = 3.4 # float | Search by maximal confidence index (optional)
provenances = ['provenances_example'] # list[str] | Search by provenances (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
operators = ['operators_example'] # list[str] | Search by operators (optional)
group_of_germplasm = 'group_of_germplasm_example' # str | Group filter (optional)
germplasm_uris = ['germplasm_uris_example'] # list[str] | Germplasm uris, can be an empty array but can't be null (optional)
count_limit = 1000 # int | Count limit. Specify the maximum number of data to count. Set to 0 for no limit (optional) (default to 1000)

try:
    # Count data
    api_response = api_instance.count_data(authorization, body=body, accept_language=accept_language, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, operators=operators, group_of_germplasm=group_of_germplasm, germplasm_uris=germplasm_uris, count_limit=count_limit)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->count_data: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Targets uris, can be an empty array but can&#x27;t be null | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **timezone** | **str**| Precise the timezone corresponding to the given dates | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **variables** | [**list[str]**](str.md)| Search by variables uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **min_confidence** | **float**| Search by minimal confidence index | [optional] 
 **max_confidence** | **float**| Search by maximal confidence index | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenances | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **operators** | [**list[str]**](str.md)| Search by operators | [optional] 
 **group_of_germplasm** | **str**| Group filter | [optional] 
 **germplasm_uris** | [**list[str]**](str.md)| Germplasm uris, can be an empty array but can&#x27;t be null | [optional] 
 **count_limit** | **int**| Count limit. Specify the maximum number of data to count. Set to 0 for no limit | [optional] [default to 1000]

### Return type

**int**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **count_datafiles**
> int count_datafiles(authorization, target=target, device=device, accept_language=accept_language)

Count datafiles

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
target = ['target_example'] # list[str] | Target URI (optional)
device = ['device_example'] # list[str] | Device URI (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Count datafiles
    api_response = api_instance.count_datafiles(authorization, target=target, device=device, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->count_datafiles: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **target** | [**list[str]**](str.md)| Target URI | [optional] 
 **device** | [**list[str]**](str.md)| Device URI | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**int**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_provenance**
> str create_provenance(authorization, body=body, accept_language=accept_language)

Add a provenance

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.ProvenanceCreationDTO() # ProvenanceCreationDTO | Provenance description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Add a provenance
    api_response = api_instance.create_provenance(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->create_provenance: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**ProvenanceCreationDTO**](ProvenanceCreationDTO.md)| Provenance description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_data**
> str delete_data(uri, authorization, accept_language=accept_language)

Delete data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uri = 'uri_example' # str | Data URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete data
    api_response = api_instance.delete_data(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->delete_data: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Data URI | 
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

# **delete_data_on_search**
> str delete_data_on_search(authorization, experiment=experiment, target=target, variable=variable, provenance=provenance, accept_language=accept_language)

Delete data on criteria

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
experiment = 'experiment_example' # str | Search by experiment uri (optional)
target = 'target_example' # str | Search by target uri (optional)
variable = 'variable_example' # str | Search by variable uri (optional)
provenance = 'provenance_example' # str | Search by provenance uri (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete data on criteria
    api_response = api_instance.delete_data_on_search(authorization, experiment=experiment, target=target, variable=variable, provenance=provenance, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->delete_data_on_search: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **experiment** | **str**| Search by experiment uri | [optional] 
 **target** | **str**| Search by target uri | [optional] 
 **variable** | **str**| Search by variable uri | [optional] 
 **provenance** | **str**| Search by provenance uri | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_provenance**
> str delete_provenance(uri, authorization, accept_language=accept_language)

Delete a provenance that doesn't describe data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uri = 'uri_example' # str | Provenance URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a provenance that doesn't describe data
    api_response = api_instance.delete_provenance(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->delete_provenance: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Provenance URI | 
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

# **export_data**
> export_data(authorization, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, targets=targets, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, operators=operators, mode=mode, with_raw_data=with_raw_data, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Export data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
timezone = 'timezone_example' # str | Precise the timezone corresponding to the given dates (optional)
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
targets = ['targets_example'] # list[str] | Search by targets (optional)
variables = ['variables_example'] # list[str] | Search by variables (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
min_confidence = 3.4 # float | Search by minimal confidence index (optional)
max_confidence = 3.4 # float | Search by maximal confidence index (optional)
provenances = ['provenances_example'] # list[str] | Search by provenances (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
operators = ['operators_example'] # list[str] | Search by operators (optional)
mode = 'wide' # str | Format wide or long (optional) (default to wide)
with_raw_data = false # bool | Export also raw_data (optional) (default to false)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Export data
    api_instance.export_data(authorization, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, targets=targets, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, operators=operators, mode=mode, with_raw_data=with_raw_data, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling DataApi->export_data: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **timezone** | **str**| Precise the timezone corresponding to the given dates | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **targets** | [**list[str]**](str.md)| Search by targets | [optional] 
 **variables** | [**list[str]**](str.md)| Search by variables | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **min_confidence** | **float**| Search by minimal confidence index | [optional] 
 **max_confidence** | **float**| Search by maximal confidence index | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenances | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **operators** | [**list[str]**](str.md)| Search by operators | [optional] 
 **mode** | **str**| Format wide or long | [optional] [default to wide]
 **with_raw_data** | **bool**| Export also raw_data | [optional] [default to false]
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: text/plain

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **export_data1**
> export_data1(authorization, body=body, accept_language=accept_language)

Export data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.DataSearchDTO() # DataSearchDTO | CSV export configuration (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Export data
    api_instance.export_data1(authorization, body=body, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling DataApi->export_data1: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**DataSearchDTO**](DataSearchDTO.md)| CSV export configuration | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: text/plain

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_data**
> DataGetDetailsDTO get_data(uri, authorization, accept_language=accept_language)

Get data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uri = 'uri_example' # str | Data URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get data
    api_response = api_instance.get_data(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_data: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Data URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**DataGetDetailsDTO**](DataGetDetailsDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_data_file**
> get_data_file(uri, authorization, accept_language=accept_language)

Get a data file

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uri = 'uri_example' # str | Search by fileUri
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a data file
    api_instance.get_data_file(uri, authorization, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling DataApi->get_data_file: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Search by fileUri | 
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

# **get_data_file_description**
> DataFileGetDTO get_data_file_description(uri, authorization, accept_language=accept_language)

Get a data file description

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uri = 'uri_example' # str | Search by fileUri
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a data file description
    api_response = api_instance.get_data_file_description(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_data_file_description: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Search by fileUri | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**DataFileGetDTO**](DataFileGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_data_file_descriptions_by_search**
> list[DataFileGetDTO] get_data_file_descriptions_by_search(authorization, rdf_type=rdf_type, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, targets=targets, devices=devices, provenances=provenances, metadata=metadata, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search data files

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
rdf_type = 'rdf_type_example' # str | Search by rdf type uri (optional)
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
timezone = 'timezone_example' # str | Precise the timezone corresponding to the given dates (optional)
experiments = ['experiments_example'] # list[str] | Search by experiments (optional)
targets = ['targets_example'] # list[str] | Search by targets uris list (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
provenances = ['provenances_example'] # list[str] | Search by provenance uris list (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search data files
    api_response = api_instance.get_data_file_descriptions_by_search(authorization, rdf_type=rdf_type, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, targets=targets, devices=devices, provenances=provenances, metadata=metadata, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_data_file_descriptions_by_search: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **rdf_type** | **str**| Search by rdf type uri | [optional] 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **timezone** | **str**| Precise the timezone corresponding to the given dates | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiments | [optional] 
 **targets** | [**list[str]**](str.md)| Search by targets uris list | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenance uris list | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[DataFileGetDTO]**](DataFileGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_data_file_descriptions_by_targets**
> list[DataFileGetDTO] get_data_file_descriptions_by_targets(authorization, body=body, accept_language=accept_language, rdf_type=rdf_type, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, devices=devices, provenances=provenances, metadata=metadata, order_by=order_by, page=page, page_size=page_size)

Search data files for a large list of targets 

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Targets uris, can be an empty array but can't be null (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
rdf_type = 'rdf_type_example' # str | Search by rdf type uri (optional)
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
timezone = 'timezone_example' # str | Precise the timezone corresponding to the given dates (optional)
experiments = ['experiments_example'] # list[str] | Search by experiments (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
provenances = ['provenances_example'] # list[str] | Search by provenance uris list (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)

try:
    # Search data files for a large list of targets 
    api_response = api_instance.get_data_file_descriptions_by_targets(authorization, body=body, accept_language=accept_language, rdf_type=rdf_type, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, devices=devices, provenances=provenances, metadata=metadata, order_by=order_by, page=page, page_size=page_size)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_data_file_descriptions_by_targets: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Targets uris, can be an empty array but can&#x27;t be null | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **rdf_type** | **str**| Search by rdf type uri | [optional] 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **timezone** | **str**| Precise the timezone corresponding to the given dates | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiments | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenance uris list | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]

### Return type

[**list[DataFileGetDTO]**](DataFileGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_data_list_by_targets**
> list[DataGetSearchDTO] get_data_list_by_targets(authorization, body=body, accept_language=accept_language, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, group_of_germplasm=group_of_germplasm, operators=operators, germplasm_uris=germplasm_uris, order_by=order_by, page=page, page_size=page_size)

Search data for a large list of targets

Deprecated. Use searchDataListByTargets (/search) service which is more optimized

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Targets uris, can be an empty array but can't be null (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
timezone = 'timezone_example' # str | Precise the timezone corresponding to the given dates (optional)
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
variables = ['variables_example'] # list[str] | Search by variables uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
min_confidence = 3.4 # float | Search by minimal confidence index (optional)
max_confidence = 3.4 # float | Search by maximal confidence index (optional)
provenances = ['provenances_example'] # list[str] | Search by provenances (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
group_of_germplasm = 'group_of_germplasm_example' # str | Group filter (optional)
operators = ['operators_example'] # list[str] | Search by operators (optional)
germplasm_uris = ['germplasm_uris_example'] # list[str] | Targets uris, can be an empty array but can't be null (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)

try:
    # Search data for a large list of targets
    api_response = api_instance.get_data_list_by_targets(authorization, body=body, accept_language=accept_language, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, group_of_germplasm=group_of_germplasm, operators=operators, germplasm_uris=germplasm_uris, order_by=order_by, page=page, page_size=page_size)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_data_list_by_targets: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Targets uris, can be an empty array but can&#x27;t be null | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **timezone** | **str**| Precise the timezone corresponding to the given dates | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **variables** | [**list[str]**](str.md)| Search by variables uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **min_confidence** | **float**| Search by minimal confidence index | [optional] 
 **max_confidence** | **float**| Search by maximal confidence index | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenances | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **group_of_germplasm** | **str**| Group filter | [optional] 
 **operators** | [**list[str]**](str.md)| Search by operators | [optional] 
 **germplasm_uris** | [**list[str]**](str.md)| Targets uris, can be an empty array but can&#x27;t be null | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]

### Return type

[**list[DataGetSearchDTO]**](DataGetSearchDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_data_series_by_facility**
> DataVariableSeriesGetDTO get_data_series_by_facility(variable, target, authorization, start_date=start_date, end_date=end_date, calculated_only=calculated_only, accept_language=accept_language)

Get all data series associated with a facility

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
variable = 'variable_example' # str | variable URI
target = 'target_example' # str | target URI
authorization = 'authorization_example' # str | Authentication token
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
calculated_only = true # bool | Retreive calculated series only (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get all data series associated with a facility
    api_response = api_instance.get_data_series_by_facility(variable, target, authorization, start_date=start_date, end_date=end_date, calculated_only=calculated_only, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_data_series_by_facility: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **variable** | **str**| variable URI | 
 **target** | **str**| target URI | 
 **authorization** | **str**| Authentication token | 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **calculated_only** | **bool**| Retreive calculated series only | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**DataVariableSeriesGetDTO**](DataVariableSeriesGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_datafiles_provenances**
> list[ProvenanceGetDTO] get_datafiles_provenances(authorization, experiments=experiments, targets=targets, devices=devices, accept_language=accept_language)

Search provenances linked to datafiles

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
targets = ['targets_example'] # list[str] | Search by targets uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search provenances linked to datafiles
    api_response = api_instance.get_datafiles_provenances(authorization, experiments=experiments, targets=targets, devices=devices, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_datafiles_provenances: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **targets** | [**list[str]**](str.md)| Search by targets uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ProvenanceGetDTO]**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_datafiles_provenances_by_targets**
> list[ProvenanceGetDTO] get_datafiles_provenances_by_targets(authorization, body=body, accept_language=accept_language, experiments=experiments, devices=devices)

Search provenances linked to datafiles for a large list of targets

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Search by targets uris (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)

try:
    # Search provenances linked to datafiles for a large list of targets
    api_response = api_instance.get_datafiles_provenances_by_targets(authorization, body=body, accept_language=accept_language, experiments=experiments, devices=devices)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_datafiles_provenances_by_targets: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Search by targets uris | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 

### Return type

[**list[ProvenanceGetDTO]**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_mathematical_operators**
> list[str] get_mathematical_operators(authorization, accept_language=accept_language)

Get mathematical operators

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get mathematical operators
    api_response = api_instance.get_mathematical_operators(authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_mathematical_operators: %s\n" % e)
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

# **get_pictures_thumbnails**
> get_pictures_thumbnails(uri, authorization, scaled_width=scaled_width, scaled_height=scaled_height, accept_language=accept_language)

Get a picture thumbnail

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uri = 'uri_example' # str | Search by fileUri
authorization = 'authorization_example' # str | Authentication token
scaled_width = 640 # int | Thumbnail width (optional) (default to 640)
scaled_height = 360 # int | Thumbnail height (optional) (default to 360)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a picture thumbnail
    api_instance.get_pictures_thumbnails(uri, authorization, scaled_width=scaled_width, scaled_height=scaled_height, accept_language=accept_language)
except ApiException as e:
    print("Exception when calling DataApi->get_pictures_thumbnails: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Search by fileUri | 
 **authorization** | **str**| Authentication token | 
 **scaled_width** | **int**| Thumbnail width | [optional] [default to 640]
 **scaled_height** | **int**| Thumbnail height | [optional] [default to 360]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_provenance**
> ProvenanceGetDTO get_provenance(uri, authorization, accept_language=accept_language)

Get a provenance

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uri = 'uri_example' # str | Provenance URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a provenance
    api_response = api_instance.get_provenance(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_provenance: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Provenance URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**ProvenanceGetDTO**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_provenances_by_uris**
> list[ProvenanceGetDTO] get_provenances_by_uris(uris, authorization, accept_language=accept_language)

Get a list of provenances by their URIs

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
uris = ['uris_example'] # list[str] | Provenances URIs
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a list of provenances by their URIs
    api_response = api_instance.get_provenances_by_uris(uris, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_provenances_by_uris: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uris** | [**list[str]**](str.md)| Provenances URIs | 
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

# **get_used_provenances**
> list[ProvenanceGetDTO] get_used_provenances(authorization, experiments=experiments, targets=targets, variables=variables, devices=devices, accept_language=accept_language)

Search provenances linked to data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
targets = ['targets_example'] # list[str] | Search by targets uris (optional)
variables = ['variables_example'] # list[str] | Search by variables uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search provenances linked to data
    api_response = api_instance.get_used_provenances(authorization, experiments=experiments, targets=targets, variables=variables, devices=devices, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_used_provenances: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **targets** | [**list[str]**](str.md)| Search by targets uris | [optional] 
 **variables** | [**list[str]**](str.md)| Search by variables uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ProvenanceGetDTO]**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_used_provenances_by_targets**
> list[ProvenanceGetDTO] get_used_provenances_by_targets(authorization, body=body, accept_language=accept_language, experiments=experiments, variables=variables, devices=devices)

Search provenances linked to data for a large list of targets

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Targets uris (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
variables = ['variables_example'] # list[str] | Search by variables uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)

try:
    # Search provenances linked to data for a large list of targets
    api_response = api_instance.get_used_provenances_by_targets(authorization, body=body, accept_language=accept_language, experiments=experiments, variables=variables, devices=devices)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_used_provenances_by_targets: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Targets uris | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **variables** | [**list[str]**](str.md)| Search by variables uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 

### Return type

[**list[ProvenanceGetDTO]**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_used_variables**
> list[VariableGetDTO] get_used_variables(authorization, experiments=experiments, targets=targets, provenances=provenances, devices=devices, accept_language=accept_language)

Get variables linked to data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
targets = ['targets_example'] # list[str] | Search by targets uris (optional)
provenances = ['provenances_example'] # list[str] | Search by provenance uris (optional)
devices = ['devices_example'] # list[str] | Search by device uris (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get variables linked to data
    api_response = api_instance.get_used_variables(authorization, experiments=experiments, targets=targets, provenances=provenances, devices=devices, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->get_used_variables: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **targets** | [**list[str]**](str.md)| Search by targets uris | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenance uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by device uris | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[VariableGetDTO]**](VariableGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **import_csv_data**
> DataCSVValidationDTO import_csv_data(file, authorization, provenance, accept_language=accept_language, experiment=experiment)

Import a CSV file for the given provenanceURI

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
provenance = 'provenance_example' # str | Provenance URI
accept_language = 'accept_language_example' # str | Request accepted language (optional)
experiment = 'experiment_example' # str | Experiment URI (optional)

try:
    # Import a CSV file for the given provenanceURI
    api_response = api_instance.import_csv_data(file, authorization, provenance, accept_language=accept_language, experiment=experiment)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->import_csv_data: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **file** | **str**|  | 
 **authorization** | **str**| Authentication token | 
 **provenance** | **str**| Provenance URI | 
 **accept_language** | **str**| Request accepted language | [optional] 
 **experiment** | **str**| Experiment URI | [optional] 

### Return type

[**DataCSVValidationDTO**](DataCSVValidationDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **post_data_file**
> str post_data_file(description, file, authorization, accept_language=accept_language)

Add a data file

{\"rdf_type\":\"http://www.opensilex.org/vocabulary/oeso#Image\", \"date\":\"2020-08-21T00:00:00+01:00\", \"target\":\"http://plot01\", \"provenance\": { \"uri\":\"http://opensilex.dev/provenance/1598001689415\" }, \"metadata\":{ \"LabelView\" : \"side90\", \"paramA\" : \"90\"}}

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
description = 'description_example' # str | 
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Add a data file
    api_response = api_instance.post_data_file(description, file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->post_data_file: %s\n" % e)
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

# **post_data_file_paths**
> str post_data_file_paths(body, authorization, accept_language=accept_language)

Describe datafiles and give their relative paths in the configured storage system. In the case of already stored datafiles.

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
body = [opensilex_swagger_client.DataFilePathCreationDTO()] # list[DataFilePathCreationDTO] | Metadata of the file
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Describe datafiles and give their relative paths in the configured storage system. In the case of already stored datafiles.
    api_response = api_instance.post_data_file_paths(body, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->post_data_file_paths: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | [**list[DataFilePathCreationDTO]**](DataFilePathCreationDTO.md)| Metadata of the file | 
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

# **search_data_list**
> list[DataGetSearchDTO] search_data_list(authorization, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, targets=targets, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, operators=operators, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search data

Deprecated. Use searchDataListByTargets (/search) service which is more optimized

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
timezone = 'timezone_example' # str | Precise the timezone corresponding to the given dates (optional)
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
targets = ['targets_example'] # list[str] | Search by targets uris (optional)
variables = ['variables_example'] # list[str] | Search by variables uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
min_confidence = 3.4 # float | Search by minimal confidence index (optional)
max_confidence = 3.4 # float | Search by maximal confidence index (optional)
provenances = ['provenances_example'] # list[str] | Search by provenances (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
operators = ['operators_example'] # list[str] | Search by operators (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search data
    api_response = api_instance.search_data_list(authorization, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, targets=targets, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, operators=operators, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->search_data_list: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **timezone** | **str**| Precise the timezone corresponding to the given dates | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **targets** | [**list[str]**](str.md)| Search by targets uris | [optional] 
 **variables** | [**list[str]**](str.md)| Search by variables uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **min_confidence** | **float**| Search by minimal confidence index | [optional] 
 **max_confidence** | **float**| Search by maximal confidence index | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenances | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **operators** | [**list[str]**](str.md)| Search by operators | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[DataGetSearchDTO]**](DataGetSearchDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_data_list_by_targets**
> list[DataGetSearchDTO] search_data_list_by_targets(authorization, body=body, accept_language=accept_language, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, group_of_germplasm=group_of_germplasm, operators=operators, germplasm_uris=germplasm_uris, order_by=order_by, page=page, page_size=page_size)

Search data for a large list of targets

Optimized search. The total count of element is not returned. Use countData (/count) service in order to get exact count of element

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = ['body_example'] # list[str] | Targets uris, can be an empty array but can't be null (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
timezone = 'timezone_example' # str | Precise the timezone corresponding to the given dates (optional)
experiments = ['experiments_example'] # list[str] | Search by experiment uris (optional)
variables = ['variables_example'] # list[str] | Search by variables uris (optional)
devices = ['devices_example'] # list[str] | Search by devices uris (optional)
min_confidence = 3.4 # float | Search by minimal confidence index (optional)
max_confidence = 3.4 # float | Search by maximal confidence index (optional)
provenances = ['provenances_example'] # list[str] | Search by provenances (optional)
metadata = 'metadata_example' # str | Search by metadata (optional)
group_of_germplasm = 'group_of_germplasm_example' # str | Group filter (optional)
operators = ['operators_example'] # list[str] | Search by operators (optional)
germplasm_uris = ['germplasm_uris_example'] # list[str] | Targets uris, can be an empty array but can't be null (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)

try:
    # Search data for a large list of targets
    api_response = api_instance.search_data_list_by_targets(authorization, body=body, accept_language=accept_language, start_date=start_date, end_date=end_date, timezone=timezone, experiments=experiments, variables=variables, devices=devices, min_confidence=min_confidence, max_confidence=max_confidence, provenances=provenances, metadata=metadata, group_of_germplasm=group_of_germplasm, operators=operators, germplasm_uris=germplasm_uris, order_by=order_by, page=page, page_size=page_size)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->search_data_list_by_targets: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[str]**](str.md)| Targets uris, can be an empty array but can&#x27;t be null | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **timezone** | **str**| Precise the timezone corresponding to the given dates | [optional] 
 **experiments** | [**list[str]**](str.md)| Search by experiment uris | [optional] 
 **variables** | [**list[str]**](str.md)| Search by variables uris | [optional] 
 **devices** | [**list[str]**](str.md)| Search by devices uris | [optional] 
 **min_confidence** | **float**| Search by minimal confidence index | [optional] 
 **max_confidence** | **float**| Search by maximal confidence index | [optional] 
 **provenances** | [**list[str]**](str.md)| Search by provenances | [optional] 
 **metadata** | **str**| Search by metadata | [optional] 
 **group_of_germplasm** | **str**| Group filter | [optional] 
 **operators** | [**list[str]**](str.md)| Search by operators | [optional] 
 **germplasm_uris** | [**list[str]**](str.md)| Targets uris, can be an empty array but can&#x27;t be null | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]

### Return type

[**list[DataGetSearchDTO]**](DataGetSearchDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_provenance**
> list[ProvenanceGetDTO] search_provenance(authorization, name=name, description=description, activity=activity, activity_type=activity_type, agent=agent, agent_type=agent_type, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Get provenances

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
name = 'name_example' # str | Regex pattern for filtering by name (optional)
description = 'description_example' # str | Search by description (optional)
activity = 'activity_example' # str | Search by activity URI (optional)
activity_type = 'activity_type_example' # str | Search by activity type (optional)
agent = ['agent_example'] # list[str] | Search by agent URIs (optional)
agent_type = 'agent_type_example' # str | Search by agent type (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get provenances
    api_response = api_instance.search_provenance(authorization, name=name, description=description, activity=activity, activity_type=activity_type, agent=agent, agent_type=agent_type, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->search_provenance: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **name** | **str**| Regex pattern for filtering by name | [optional] 
 **description** | **str**| Search by description | [optional] 
 **activity** | **str**| Search by activity URI | [optional] 
 **activity_type** | **str**| Search by activity type | [optional] 
 **agent** | [**list[str]**](str.md)| Search by agent URIs | [optional] 
 **agent_type** | **str**| Search by agent type | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[ProvenanceGetDTO]**](ProvenanceGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update**
> str update(authorization, body=body, accept_language=accept_language)

Update data

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.DataUpdateDTO() # DataUpdateDTO | Data description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update data
    api_response = api_instance.update(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->update: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**DataUpdateDTO**](DataUpdateDTO.md)| Data description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_confidence**
> str update_confidence(authorization, uri, body=body, accept_language=accept_language)

Update confidence index

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
uri = 'uri_example' # str | Data URI
body = opensilex_swagger_client.DataConfidenceDTO() # DataConfidenceDTO | Data description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update confidence index
    api_response = api_instance.update_confidence(authorization, uri, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->update_confidence: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **uri** | **str**| Data URI | 
 **body** | [**DataConfidenceDTO**](DataConfidenceDTO.md)| Data description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_provenance**
> str update_provenance(authorization, body=body, accept_language=accept_language)

Update a provenance

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.ProvenanceUpdateDTO() # ProvenanceUpdateDTO | Provenance description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a provenance
    api_response = api_instance.update_provenance(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->update_provenance: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**ProvenanceUpdateDTO**](ProvenanceUpdateDTO.md)| Provenance description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **validate_csv**
> DataCSVValidationDTO validate_csv(file, authorization, provenance, accept_language=accept_language, experiment=experiment)

Import a CSV file for the given provenanceURI.

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.DataApi()
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
provenance = 'provenance_example' # str | Provenance URI
accept_language = 'accept_language_example' # str | Request accepted language (optional)
experiment = 'experiment_example' # str | Experiment URI (optional)

try:
    # Import a CSV file for the given provenanceURI.
    api_response = api_instance.validate_csv(file, authorization, provenance, accept_language=accept_language, experiment=experiment)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling DataApi->validate_csv: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **file** | **str**|  | 
 **authorization** | **str**| Authentication token | 
 **provenance** | **str**| Provenance URI | 
 **accept_language** | **str**| Request accepted language | [optional] 
 **experiment** | **str**| Experiment URI | [optional] 

### Return type

[**DataCSVValidationDTO**](DataCSVValidationDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

