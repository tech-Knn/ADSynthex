'use client';

import React from 'react';
import { Select } from 'antd';

const { Option } = Select;

// Major countries with their geo target constants based on Google Ads API
export const COUNTRIES = [
  { code: 'US', name: 'United States', geoConstant: '2840' },
  { code: 'GB', name: 'United Kingdom', geoConstant: '2826' },
  { code: 'CA', name: 'Canada', geoConstant: '2124' },
  { code: 'AU', name: 'Australia', geoConstant: '2036' },
  { code: 'DE', name: 'Germany', geoConstant: '2276' },
  { code: 'FR', name: 'France', geoConstant: '2250' },
  { code: 'IT', name: 'Italy', geoConstant: '2380' },
  { code: 'ES', name: 'Spain', geoConstant: '2724' },
  { code: 'NL', name: 'Netherlands', geoConstant: '2528' },
  { code: 'BE', name: 'Belgium', geoConstant: '2056' },
  { code: 'CH', name: 'Switzerland', geoConstant: '2756' },
  { code: 'AT', name: 'Austria', geoConstant: '2040' },
  { code: 'SE', name: 'Sweden', geoConstant: '2752' },
  { code: 'NO', name: 'Norway', geoConstant: '2578' },
  { code: 'DK', name: 'Denmark', geoConstant: '2208' },
  { code: 'FI', name: 'Finland', geoConstant: '2246' },
  { code: 'JP', name: 'Japan', geoConstant: '2392' },
  { code: 'KR', name: 'South Korea', geoConstant: '2410' },
  { code: 'CN', name: 'China', geoConstant: '2156' },
  { code: 'IN', name: 'India', geoConstant: '2356' },
  { code: 'BR', name: 'Brazil', geoConstant: '2076' },
  { code: 'MX', name: 'Mexico', geoConstant: '2484' },
  { code: 'AR', name: 'Argentina', geoConstant: '2032' },
  { code: 'CL', name: 'Chile', geoConstant: '2152' },
  { code: 'CO', name: 'Colombia', geoConstant: '2170' },
  { code: 'PE', name: 'Peru', geoConstant: '2604' },
  { code: 'ZA', name: 'South Africa', geoConstant: '2710' },
  { code: 'EG', name: 'Egypt', geoConstant: '2818' },
  { code: 'AE', name: 'United Arab Emirates', geoConstant: '2784' },
  { code: 'SA', name: 'Saudi Arabia', geoConstant: '2682' },
  { code: 'IL', name: 'Israel', geoConstant: '2376' },
  { code: 'TR', name: 'Turkey', geoConstant: '2792' },
  { code: 'RU', name: 'Russia', geoConstant: '2643' },
  { code: 'PL', name: 'Poland', geoConstant: '2616' },
  { code: 'CZ', name: 'Czech Republic', geoConstant: '2203' },
  { code: 'HU', name: 'Hungary', geoConstant: '2348' },
  { code: 'RO', name: 'Romania', geoConstant: '2642' },
  { code: 'BG', name: 'Bulgaria', geoConstant: '2100' },
  { code: 'GR', name: 'Greece', geoConstant: '2300' },
  { code: 'PT', name: 'Portugal', geoConstant: '2620' },
  { code: 'IE', name: 'Ireland', geoConstant: '2372' },
  { code: 'LU', name: 'Luxembourg', geoConstant: '2442' },
  { code: 'MT', name: 'Malta', geoConstant: '2470' },
  { code: 'CY', name: 'Cyprus', geoConstant: '2196' },
  { code: 'LV', name: 'Latvia', geoConstant: '2428' },
  { code: 'LT', name: 'Lithuania', geoConstant: '2440' },
  { code: 'EE', name: 'Estonia', geoConstant: '2233' },
  { code: 'SK', name: 'Slovakia', geoConstant: '2703' },
  { code: 'SI', name: 'Slovenia', geoConstant: '2705' },
  { code: 'HR', name: 'Croatia', geoConstant: '2191' },
  { code: 'NZ', name: 'New Zealand', geoConstant: '2554' },
  { code: 'SG', name: 'Singapore', geoConstant: '2702' },
  { code: 'MY', name: 'Malaysia', geoConstant: '2458' },
  { code: 'TH', name: 'Thailand', geoConstant: '2764' },
  { code: 'PH', name: 'Philippines', geoConstant: '2608' },
  { code: 'ID', name: 'Indonesia', geoConstant: '2360' },
  { code: 'VN', name: 'Vietnam', geoConstant: '2704' },
  { code: 'HK', name: 'Hong Kong', geoConstant: '2344' },
  { code: 'TW', name: 'Taiwan', geoConstant: '2158' }
];

interface CountrySelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

const CountrySelector: React.FC<CountrySelectorProps> = ({ 
  value, 
  onChange, 
  placeholder = "Select target country" 
}) => {
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      showSearch
      optionFilterProp="children"
      filterOption={(input, option) =>
        (option?.children as unknown as string).toLowerCase().indexOf(input.toLowerCase()) >= 0
      }
      style={{ width: '100%' }}
    >
      {COUNTRIES.map((country) => (
        <Option key={country.code} value={country.code}>
          {country.name}
        </Option>
      ))}
    </Select>
  );
};

export default CountrySelector;

// Helper function to get geo constant from country code
export const getGeoConstant = (countryCode: string): string => {
  const country = COUNTRIES.find(c => c.code === countryCode);
  return country ? country.geoConstant : '2840'; // Default to US
};

// Helper function to get country name from code
export const getCountryName = (countryCode: string): string => {
  const country = COUNTRIES.find(c => c.code === countryCode);
  return country ? country.name : 'United States';
};







