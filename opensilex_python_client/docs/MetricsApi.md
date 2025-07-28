# opensilex_swagger_client.MetricsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_experiment_summary_history**](MetricsApi.md#get_experiment_summary_history) | **GET** /core/metrics/experiment/{uri} | Get an experiment summary history
[**get_running_experiments_summary**](MetricsApi.md#get_running_experiments_summary) | **GET** /core/metrics/running_experiments | Get running experiments metrics
[**get_system_metrics**](MetricsApi.md#get_system_metrics) | **GET** /core/metrics/system | Get system metrics
[**get_system_metrics_summary**](MetricsApi.md#get_system_metrics_summary) | **GET** /core/metrics/system/summary | Get system metrics summary

# **get_experiment_summary_history**
> MetricDTO get_experiment_summary_history(uri, authorization, start_date=start_date, end_date=end_date, page=page, page_size=page_size, accept_language=accept_language)

Get an experiment summary history

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.MetricsApi()
uri = 'uri_example' # str | Metrics URI
authorization = 'authorization_example' # str | Authentication token
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get an experiment summary history
    api_response = api_instance.get_experiment_summary_history(uri, authorization, start_date=start_date, end_date=end_date, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling MetricsApi->get_experiment_summary_history: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Metrics URI | 
 **authorization** | **str**| Authentication token | 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**MetricDTO**](MetricDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_running_experiments_summary**
> MetricDTO get_running_experiments_summary(authorization, start_date=start_date, end_date=end_date, page=page, page_size=page_size, accept_language=accept_language)

Get running experiments metrics

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.MetricsApi()
authorization = 'authorization_example' # str | Authentication token
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get running experiments metrics
    api_response = api_instance.get_running_experiments_summary(authorization, start_date=start_date, end_date=end_date, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling MetricsApi->get_running_experiments_summary: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**MetricDTO**](MetricDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_system_metrics**
> list[MetricDTO] get_system_metrics(authorization, start_date=start_date, end_date=end_date, page=page, page_size=page_size, accept_language=accept_language)

Get system metrics

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.MetricsApi()
authorization = 'authorization_example' # str | Authentication token
start_date = 'start_date_example' # str | Search by minimal date (optional)
end_date = 'end_date_example' # str | Search by maximal date (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get system metrics
    api_response = api_instance.get_system_metrics(authorization, start_date=start_date, end_date=end_date, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling MetricsApi->get_system_metrics: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **start_date** | **str**| Search by minimal date | [optional] 
 **end_date** | **str**| Search by maximal date | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[MetricDTO]**](MetricDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_system_metrics_summary**
> MetricPeriodDTO get_system_metrics_summary(authorization, period=period, page=page, page_size=page_size, accept_language=accept_language)

Get system metrics summary

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.MetricsApi()
authorization = 'authorization_example' # str | Authentication token
period = 'period_example' # str | Search by minimal date (optional)
page = 0 # int | Page number (optional) (default to 0)
page_size = 20 # int | Page size (optional) (default to 20)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get system metrics summary
    api_response = api_instance.get_system_metrics_summary(authorization, period=period, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling MetricsApi->get_system_metrics_summary: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **period** | **str**| Search by minimal date | [optional] 
 **page** | **int**| Page number | [optional] [default to 0]
 **page_size** | **int**| Page size | [optional] [default to 20]
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**MetricPeriodDTO**](MetricPeriodDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

