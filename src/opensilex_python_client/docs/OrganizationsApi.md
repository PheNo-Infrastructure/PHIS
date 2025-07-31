# opensilex_swagger_client.OrganizationsApi

All URIs are relative to */*

Method | HTTP request | Description
------------- | ------------- | -------------
[**create_facility**](OrganizationsApi.md#create_facility) | **POST** /core/facilities | Create a facility
[**create_organization**](OrganizationsApi.md#create_organization) | **POST** /core/organisations | Create an organisation
[**create_site**](OrganizationsApi.md#create_site) | **POST** /core/sites | Create a site
[**delete_facility**](OrganizationsApi.md#delete_facility) | **DELETE** /core/facilities/{uri} | Delete a facility
[**delete_organization**](OrganizationsApi.md#delete_organization) | **DELETE** /core/organisations/{uri} | Delete an organisation
[**delete_site**](OrganizationsApi.md#delete_site) | **DELETE** /core/sites/{uri} | Delete a site
[**get_all_facilities**](OrganizationsApi.md#get_all_facilities) | **GET** /core/facilities/all_facilities | Get all facilities
[**get_facilities_by_uri**](OrganizationsApi.md#get_facilities_by_uri) | **GET** /core/facilities/by_uris | Get facilities by their URIs
[**get_facility**](OrganizationsApi.md#get_facility) | **GET** /core/facilities/{uri} | Get a facility
[**get_organization**](OrganizationsApi.md#get_organization) | **GET** /core/organisations/{uri} | Get an organisation 
[**get_site**](OrganizationsApi.md#get_site) | **GET** /core/sites/{uri} | Get a site
[**get_sites_by_uri**](OrganizationsApi.md#get_sites_by_uri) | **GET** /core/sites/by_uris | Get a list of sites
[**get_sites_with_location**](OrganizationsApi.md#get_sites_with_location) | **GET** /core/sites/with_location | Get only the list of sites with a location
[**minimal_search_facilities**](OrganizationsApi.md#minimal_search_facilities) | **GET** /core/facilities/minimal_search | Search facilities returning minimal embedded information for better performance
[**search_facilities**](OrganizationsApi.md#search_facilities) | **GET** /core/facilities | Search facilities
[**search_organizations**](OrganizationsApi.md#search_organizations) | **GET** /core/organisations | Search organisations
[**search_sites**](OrganizationsApi.md#search_sites) | **GET** /core/sites | Search all sites
[**update_facility**](OrganizationsApi.md#update_facility) | **PUT** /core/facilities | Update a facility
[**update_organization**](OrganizationsApi.md#update_organization) | **PUT** /core/organisations | Update an organisation
[**update_site**](OrganizationsApi.md#update_site) | **PUT** /core/sites | Update a site

# **create_facility**
> str create_facility(authorization, body=body, accept_language=accept_language)

Create a facility

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.FacilityCreationDTO() # FacilityCreationDTO | Facility description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create a facility
    api_response = api_instance.create_facility(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->create_facility: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**FacilityCreationDTO**](FacilityCreationDTO.md)| Facility description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_organization**
> str create_organization(authorization, body=body, accept_language=accept_language)

Create an organisation

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.OrganizationCreationDTO() # OrganizationCreationDTO | Organisation description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create an organisation
    api_response = api_instance.create_organization(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->create_organization: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**OrganizationCreationDTO**](OrganizationCreationDTO.md)| Organisation description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **create_site**
> str create_site(authorization, body=body, accept_language=accept_language)

Create a site

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.SiteCreationDTO() # SiteCreationDTO | Site creation object (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Create a site
    api_response = api_instance.create_site(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->create_site: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**SiteCreationDTO**](SiteCreationDTO.md)| Site creation object | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **delete_facility**
> str delete_facility(uri, authorization, accept_language=accept_language)

Delete a facility

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uri = 'uri_example' # str | Facility URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a facility
    api_response = api_instance.delete_facility(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->delete_facility: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Facility URI | 
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

# **delete_organization**
> str delete_organization(uri, authorization, accept_language=accept_language)

Delete an organisation

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uri = 'uri_example' # str | Organisation URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete an organisation
    api_response = api_instance.delete_organization(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->delete_organization: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Organisation URI | 
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

# **delete_site**
> str delete_site(uri, authorization, accept_language=accept_language)

Delete a site

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uri = 'uri_example' # str | Site URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Delete a site
    api_response = api_instance.delete_site(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->delete_site: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Site URI | 
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

# **get_all_facilities**
> list[NamedResourceDTO] get_all_facilities(authorization, accept_language=accept_language)

Get all facilities

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get all facilities
    api_response = api_instance.get_all_facilities(authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->get_all_facilities: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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

# **get_facilities_by_uri**
> list[FacilityNamedDTO] get_facilities_by_uri(uris, authorization, accept_language=accept_language)

Get facilities by their URIs

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uris = ['uris_example'] # list[str] | Facilities URIs
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get facilities by their URIs
    api_response = api_instance.get_facilities_by_uri(uris, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->get_facilities_by_uri: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uris** | [**list[str]**](str.md)| Facilities URIs | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[FacilityNamedDTO]**](FacilityNamedDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_facility**
> FacilityGetDTO get_facility(uri, authorization, accept_language=accept_language)

Get a facility

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uri = 'uri_example' # str | facility URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a facility
    api_response = api_instance.get_facility(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->get_facility: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| facility URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**FacilityGetDTO**](FacilityGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_organization**
> OrganizationGetDTO get_organization(uri, authorization, accept_language=accept_language)

Get an organisation 

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uri = 'uri_example' # str | Organisation URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get an organisation 
    api_response = api_instance.get_organization(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->get_organization: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Organisation URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**OrganizationGetDTO**](OrganizationGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_site**
> SiteGetDTO get_site(uri, authorization, accept_language=accept_language)

Get a site

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uri = 'uri_example' # str | Site URI
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a site
    api_response = api_instance.get_site(uri, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->get_site: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uri** | **str**| Site URI | 
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**SiteGetDTO**](SiteGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **get_sites_by_uri**
> list[NamedResourceDTO] get_sites_by_uri(uris, authorization, accept_language=accept_language)

Get a list of sites

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
uris = ['uris_example'] # list[str] | Site URIs
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get a list of sites
    api_response = api_instance.get_sites_by_uri(uris, authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->get_sites_by_uri: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uris** | [**list[str]**](str.md)| Site URIs | 
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

# **get_sites_with_location**
> list[SiteGetWithGeometryDTO] get_sites_with_location(authorization, accept_language=accept_language)

Get only the list of sites with a location

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Get only the list of sites with a location
    api_response = api_instance.get_sites_with_location(authorization, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->get_sites_with_location: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[SiteGetWithGeometryDTO]**](SiteGetWithGeometryDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **minimal_search_facilities**
> list[NamedResourceDTO] minimal_search_facilities(authorization, pattern=pattern, organizations=organizations, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search facilities returning minimal embedded information for better performance

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
pattern = '.*' # str | Regex pattern for filtering facilities by names (optional) (default to .*)
organizations = ['organizations_example'] # list[str] | List of organizations hosted by the facilities to filter (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 56 # int | Page number (optional)
page_size = 56 # int | Page size (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search facilities returning minimal embedded information for better performance
    api_response = api_instance.minimal_search_facilities(authorization, pattern=pattern, organizations=organizations, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->minimal_search_facilities: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **pattern** | **str**| Regex pattern for filtering facilities by names | [optional] [default to .*]
 **organizations** | [**list[str]**](str.md)| List of organizations hosted by the facilities to filter | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] 
 **page_size** | **int**| Page size | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[NamedResourceDTO]**](NamedResourceDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_facilities**
> list[FacilityGetDTO] search_facilities(authorization, pattern=pattern, organizations=organizations, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search facilities

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
pattern = '.*' # str | Regex pattern for filtering facilities by names (optional) (default to .*)
organizations = ['organizations_example'] # list[str] | List of organizations hosted by the facilities to filter (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 56 # int | Page number (optional)
page_size = 56 # int | Page size (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search facilities
    api_response = api_instance.search_facilities(authorization, pattern=pattern, organizations=organizations, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->search_facilities: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **pattern** | **str**| Regex pattern for filtering facilities by names | [optional] [default to .*]
 **organizations** | [**list[str]**](str.md)| List of organizations hosted by the facilities to filter | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] 
 **page_size** | **int**| Page size | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[FacilityGetDTO]**](FacilityGetDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_organizations**
> list[OrganizationDagDTO] search_organizations(authorization, pattern=pattern, organisation_uris=organisation_uris, type=type, parent_organization_uri=parent_organization_uri, facility_uri=facility_uri, accept_language=accept_language)

Search organisations

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
pattern = '.*' # str | Regex pattern for filtering list by names (optional) (default to .*)
organisation_uris = ['organisation_uris_example'] # list[str] |  organisation URIs (optional)
type = 'type_example' # str | Regex pattern for filtering list by types (optional)
parent_organization_uri = 'parent_organization_uri_example' # str | Organization every result will be direct child of (optional)
facility_uri = 'facility_uri_example' # str | Facility for filtering (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search organisations
    api_response = api_instance.search_organizations(authorization, pattern=pattern, organisation_uris=organisation_uris, type=type, parent_organization_uri=parent_organization_uri, facility_uri=facility_uri, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->search_organizations: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **pattern** | **str**| Regex pattern for filtering list by names | [optional] [default to .*]
 **organisation_uris** | [**list[str]**](str.md)|  organisation URIs | [optional] 
 **type** | **str**| Regex pattern for filtering list by types | [optional] 
 **parent_organization_uri** | **str**| Organization every result will be direct child of | [optional] 
 **facility_uri** | **str**| Facility for filtering | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[OrganizationDagDTO]**](OrganizationDagDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **search_sites**
> list[SiteGetListDTO] search_sites(authorization, pattern=pattern, organizations=organizations, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)

Search all sites

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
pattern = '.*' # str | Regex pattern for filtering sites by names (optional) (default to .*)
organizations = ['organizations_example'] # list[str] | List of organizations of the sites to filter (optional)
order_by = ['order_by_example'] # list[str] | List of fields to sort as an array of fieldName=asc|desc (optional)
page = 56 # int | Page number (optional)
page_size = 56 # int | Page size (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Search all sites
    api_response = api_instance.search_sites(authorization, pattern=pattern, organizations=organizations, order_by=order_by, page=page, page_size=page_size, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->search_sites: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **pattern** | **str**| Regex pattern for filtering sites by names | [optional] [default to .*]
 **organizations** | [**list[str]**](str.md)| List of organizations of the sites to filter | [optional] 
 **order_by** | [**list[str]**](str.md)| List of fields to sort as an array of fieldName&#x3D;asc|desc | [optional] 
 **page** | **int**| Page number | [optional] 
 **page_size** | **int**| Page size | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

[**list[SiteGetListDTO]**](SiteGetListDTO.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_facility**
> str update_facility(authorization, body=body, accept_language=accept_language)

Update a facility

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.FacilityUpdateDTO() # FacilityUpdateDTO | Facility description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a facility
    api_response = api_instance.update_facility(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->update_facility: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**FacilityUpdateDTO**](FacilityUpdateDTO.md)| Facility description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_organization**
> str update_organization(authorization, body=body, accept_language=accept_language)

Update an organisation

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.OrganizationUpdateDTO() # OrganizationUpdateDTO | Organisation description (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update an organisation
    api_response = api_instance.update_organization(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->update_organization: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**OrganizationUpdateDTO**](OrganizationUpdateDTO.md)| Organisation description | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_site**
> str update_site(authorization, body=body, accept_language=accept_language)

Update a site

### Example
```python
from __future__ import print_function
import time
import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
from pprint import pprint

# create an instance of the API class
api_instance = opensilex_swagger_client.OrganizationsApi()
authorization = 'authorization_example' # str | Authentication token
body = opensilex_swagger_client.SiteUpdateDTO() # SiteUpdateDTO | Site update object (optional)
accept_language = 'accept_language_example' # str | Request accepted language (optional)

try:
    # Update a site
    api_response = api_instance.update_site(authorization, body=body, accept_language=accept_language)
    pprint(api_response)
except ApiException as e:
    print("Exception when calling OrganizationsApi->update_site: %s\n" % e)
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authorization** | **str**| Authentication token | 
 **body** | [**SiteUpdateDTO**](SiteUpdateDTO.md)| Site update object | [optional] 
 **accept_language** | **str**| Request accepted language | [optional] 

### Return type

**str**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

