# opensilex_swagger_client.EventsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**count_events**](EventsApi.md#count_events) | **GET** /core/events/count | Count events
[**create_events**](EventsApi.md#create_events) | **POST** /core/events | Create a list of event
[**create_moves**](EventsApi.md#create_moves) | **POST** /core/events/moves | Create a list of move event
[**delete_event**](EventsApi.md#delete_event) | **DELETE** /core/events/{uri} | Delete an event
[**delete_move_event**](EventsApi.md#delete_move_event) | **DELETE** /core/events/moves/{uri} | Delete a move event
[**get_event**](EventsApi.md#get_event) | **GET** /core/events/{uri} | Get an event
[**get_event_details**](EventsApi.md#get_event_details) | **GET** /core/events/{uri}/details | Get an event with all it&#x27;s properties
[**get_move_event**](EventsApi.md#get_move_event) | **GET** /core/events/moves/{uri} | Get a move with all it&#x27;s properties
[**get_move_event_by_uris**](EventsApi.md#get_move_event_by_uris) | **GET** /core/events/moves/by_uris | Get a list of moves with all positional information
[**import_event_csv**](EventsApi.md#import_event_csv) | **POST** /core/events/import | Import a CSV file with one move and one target per line
[**import_move_csv**](EventsApi.md#import_move_csv) | **POST** /core/events/moves/import | Import a CSV file with one move and one target per line
[**search_events**](EventsApi.md#search_events) | **GET** /core/events | Search events
[**update_event**](EventsApi.md#update_event) | **PUT** /core/events | Update an event
[**update_move_event**](EventsApi.md#update_move_event) | **PUT** /core/events/moves | Update a move event
[**validate_event_csv**](EventsApi.md#validate_event_csv) | **POST** /core/events/import_validation | Check a CSV file with one move and one target per line
[**validate_move_csv**](EventsApi.md#validate_move_csv) | **POST** /core/events/moves/import_validation | Check a CSV file with one move and one target per line

# **count_events**
> int count_events(targets, authorization, accept_language=accept_language)

Count events

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
targets = ['targets_example'] # list[str] | Targets URIs
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Count events
    api_response = api_instance.count_events(targets, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->count_events: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targets** | [**list[str]**](str.md)| Targets URIs | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**int**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_events**
> str create_events(authorization, body=body, accept_language=accept_language)

Create a list of event

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
authorization = 'authorization_example' # str | Authentication token
body = [opensilex_swagger_client.EventCreationDTO()] # list[EventCreationDTO] |  (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create a list of event
    api_response = api_instance.create_events(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->create_events: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[EventCreationDTO]**](EventCreationDTO.md)|  | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_moves**
> str create_moves(authorization, body=body, accept_language=accept_language)

Create a list of move event

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
authorization = 'authorization_example' # str | Authentication token
body = [opensilex_swagger_client.MoveCreationDTO()] # list[MoveCreationDTO] |  (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create a list of move event
    api_response = api_instance.create_moves(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->create_moves: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**list[MoveCreationDTO]**](MoveCreationDTO.md)|  | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_event**
> str delete_event(uri, authorization, accept_language=accept_language)

Delete an event

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
uri = 'uri_example' # str | Event URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete an event
    api_response = api_instance.delete_event(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->delete_event: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Event URI | 
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

# **delete_move_event**
> str delete_move_event(uri, authorization, accept_language=accept_language)

Delete a move event

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
uri = 'uri_example' # str | Event URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a move event
    api_response = api_instance.delete_move_event(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->delete_move_event: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Event URI | 
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

# **get_event**
> EventGetDTO get_event(uri, authorization, accept_language=accept_language)

Get an event

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
uri = 'uri_example' # str | Event URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get an event
    api_response = api_instance.get_event(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->get_event: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Event URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**EventGetDTO**](EventGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_event_details**
> EventDetailsDTO get_event_details(uri, authorization, accept_language=accept_language)

Get an event with all it's properties

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
uri = 'uri_example' # str | Event URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get an event with all it's properties
    api_response = api_instance.get_event_details(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->get_event_details: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Event URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**EventDetailsDTO**](EventDetailsDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_move_event**
> MoveDetailsDTO get_move_event(uri, authorization, accept_language=accept_language)

Get a move with all it's properties

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
uri = 'uri_example' # str | Move URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a move with all it's properties
    api_response = api_instance.get_move_event(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->get_move_event: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Move URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**MoveDetailsDTO**](MoveDetailsDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_move_event_by_uris**
> list[MoveDetailsDTO] get_move_event_by_uris(uris, authorization, accept_language=accept_language)

Get a list of moves with all positional information

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
uris = ['uris_example'] # list[str] | Move URIs
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a list of moves with all positional information
    api_response = api_instance.get_move_event_by_uris(uris, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->get_move_event_by_uris: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uris** | [**list[str]**](str.md)| Move URIs | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[MoveDetailsDTO]**](MoveDetailsDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **import_event_csv**
> CSVValidationDTO import_event_csv(description, file, authorization, accept_language=accept_language)

Import a CSV file with one move and one target per line

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
description = opensilex_swagger_client.Ref() # Ref | 
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Import a CSV file with one move and one target per line
    api_response = api_instance.import_event_csv(description, file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->import_event_csv: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **description** | [**Ref**](.md)|  | 
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

# **import_move_csv**
> CSVValidationDTO import_move_csv(file, authorization, accept_language=accept_language)

Import a CSV file with one move and one target per line

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Import a CSV file with one move and one target per line
    api_response = api_instance.import_move_csv(file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->import_move_csv: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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

# **search_events**
> list[EventGetDTO] search_events(authorization, rdf_type=rdf_type, start=start, end=end, target=target, description=description, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search events

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
authorization = 'authorization_example' # str | Authentication token
rdf_type = 'rdf_type_example' # str | Event type (optional)
start = 'start_example' # str | Start date : match event after the given start date (optional)
end = 'end_example' # str | End date : match event before the given end date (optional)
target = 'target_example' # str | Target partial/exact URI (optional)
description = 'description_example' # str | Description regex pattern (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 56 # int | Page number (optional)
page_size = 56 # int | Page size (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search events
    api_response = api_instance.search_events(authorization, rdf_type=rdf_type, start=start, end=end, target=target, description=description, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->search_events: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **rdf_type** | **str**| Event type | [optional] 
 **start** | **str**| Start date : match event after the given start date | [optional] 
 **end** | **str**| End date : match event before the given end date | [optional] 
 **target** | **str**| Target partial/exact URI | [optional] 
 **description** | **str**| Description regex pattern | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] 
 **page_size** | **int**| Page size | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[EventGetDTO]**](EventGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_event**
> str update_event(authorization, body=body, accept_language=accept_language)

Update an event

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.EventUpdateDTO() # EventUpdateDTO | Event description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update an event
    api_response = api_instance.update_event(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->update_event: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**EventUpdateDTO**](EventUpdateDTO.md)| Event description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_move_event**
> str update_move_event(authorization, body=body, accept_language=accept_language)

Update a move event

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.MoveUpdateDTO() # MoveUpdateDTO | Event description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a move event
    api_response = api_instance.update_move_event(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->update_move_event: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**MoveUpdateDTO**](MoveUpdateDTO.md)| Event description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **validate_event_csv**
> CSVValidationDTO validate_event_csv(description, file, authorization, accept_language=accept_language)

Check a CSV file with one move and one target per line

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
description = opensilex_swagger_client.Ref() # Ref | 
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Check a CSV file with one move and one target per line
    api_response = api_instance.validate_event_csv(description, file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->validate_event_csv: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **description** | [**Ref**](.md)|  | 
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

# **validate_move_csv**
> CSVValidationDTO validate_move_csv(file, authorization, accept_language=accept_language)

Check a CSV file with one move and one target per line

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.EventsApi()
file = 'file_example' # str | 
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Check a CSV file with one move and one target per line
    api_response = api_instance.validate_move_csv(file, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling EventsApi->validate_move_csv: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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

