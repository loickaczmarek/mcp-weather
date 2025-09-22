import axios, { AxiosInstance } from 'axios';
import { ErrorHandler } from '../utils/errorHandler.js';

export interface GeocodingParams {
  name: string;
  count?: number;
  language?: string;
  format?: 'json';
}

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  admin1_id?: number;
  admin2_id?: number;
  admin3_id?: number;
  admin4_id?: number;
  timezone?: string;
  population?: number;
  postcodes?: string[];
  country_id?: number;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
}

export interface GeocodingResponse {
  results?: GeocodingResult[];
  generationtime_ms: number;
}

interface CacheEntry {
  results: GeocodingResult[];
  timestamp: number;
  generationTime: number;
}

export class GeocodingService {
  private client: AxiosInstance;
  private errorHandler: ErrorHandler;
  private cache: Map<string, CacheEntry>;
  private readonly baseUrl = 'https://geocoding-api.open-meteo.com/v1';
  private readonly cacheExpiration = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 8000,
      headers: {
        'User-Agent': 'MCP-Weather-Server/1.0.0',
        'Accept': 'application/json',
      },
    });

    this.errorHandler = ErrorHandler.getInstance();
    this.cache = new Map();

    this.setupInterceptors();
    this.startCacheCleanup();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        console.log(`🌍 Geocoding API Request: ${config.method?.toUpperCase()} ${config.url}`);
        console.log(`🔍 Search query:`, config.params);
        return config;
      },
      (error) => {
        console.error('❌ Geocoding Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        const resultsCount = response.data.results?.length || 0;
        console.log(`✅ Geocoding API Response: ${response.status} - Found ${resultsCount} locations`);
        console.log(`⚡ Generation time: ${response.data.generationtime_ms}ms`);
        return response;
      },
      (error) => {
        console.error('❌ Geocoding Response Error:', {
          status: error.response?.status,
          message: error.response?.data?.error || error.message,
          url: error.config?.url
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: any): Error {
    if (error.code === 'ECONNABORTED') {
      return new Error('Geocoding service request timeout');
    }

    if (error.response?.status === 400) {
      return new Error('Invalid search parameters for geocoding');
    }

    if (error.response?.status === 429) {
      return new Error('Geocoding service rate limit exceeded');
    }

    if (error.response?.status && error.response.status >= 500) {
      return new Error('Geocoding service server error');
    }

    return new Error(`Geocoding service error: ${error.message}`);
  }

  async searchLocation(params: GeocodingParams): Promise<GeocodingResult[]> {
    try {
      // Clean and validate the search query
      const cleanedName = this.cleanLocationName(params.name);
      if (!cleanedName || cleanedName.length < 2) {
        throw this.errorHandler.createValidationError(
          'Location name must be at least 2 characters long',
          { operation: 'geocoding search', parameters: params }
        );
      }

      // Check cache first
      const cacheKey = this.getCacheKey(cleanedName, params.language, params.count);
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult) {
        console.log(`💾 Using cached geocoding result for: ${cleanedName}`);
        return cachedResult;
      }

      console.log(`🌍 Searching for location: "${cleanedName}"`);

      const searchParams = {
        name: cleanedName,
        count: Math.min(params.count || 10, 100), // Limit to max 100 results
        language: params.language || 'en',
        format: 'json'
      };

      const response = await this.client.get<GeocodingResponse>('/search', {
        params: searchParams
      });

      const results = response.data.results || [];

      // Cache the results
      this.cacheResult(cacheKey, results, response.data.generationtime_ms);

      if (results.length === 0) {
        console.log(`🔍 No locations found for: "${cleanedName}"`);
      } else {
        console.log(`📍 Found ${results.length} locations for: "${cleanedName}"`);
        results.slice(0, 3).forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.name}, ${result.country} (${result.latitude}, ${result.longitude})`);
        });
      }

      return results;

    } catch (error) {
      throw this.errorHandler.handleError(error, {
        operation: 'geocoding search',
        parameters: params
      });
    }
  }

  private cleanLocationName(name: string): string {
    if (typeof name !== 'string') {
      return '';
    }

    return name
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-'.,áàâäéèêëíìîïóòôöúùûüñçüÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÑÇ]/g, '') // Keep basic letters, spaces, hyphens, apostrophes, commas, periods, and accented characters
      .substring(0, 100); // Limit length
  }

  private getCacheKey(name: string, language?: string, count?: number): string {
    return `${name.toLowerCase()}_${language || 'en'}_${count || 10}`;
  }

  private getCachedResult(cacheKey: string): GeocodingResult[] | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiration) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.results;
  }

  private cacheResult(cacheKey: string, results: GeocodingResult[], generationTime: number): void {
    this.cache.set(cacheKey, {
      results,
      timestamp: Date.now(),
      generationTime
    });

    // Limit cache size to prevent memory issues
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  private startCacheCleanup(): void {
    // Clean expired cache entries every 30 minutes
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.cacheExpiration) {
          this.cache.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired geocoding cache entries`);
      }
    }, 30 * 60 * 1000);
  }

  async findBestMatch(locationName: string, preferredCountry?: string): Promise<GeocodingResult | null> {
    try {
      const results = await this.searchLocation({
        name: locationName,
        count: 10
      });

      if (results.length === 0) {
        return null;
      }

      // If preferred country is specified, try to find a match
      if (preferredCountry) {
        const countryMatch = results.find(result => {
          const countryCode = result.country_code?.toLowerCase();
          const country = result.country?.toLowerCase();
          return countryCode === preferredCountry.toLowerCase() ||
                 (country && country.includes(preferredCountry.toLowerCase()));
        });
        if (countryMatch) {
          return countryMatch;
        }
      }

      // Return the first result (usually the most relevant)
      return results[0] || null;

    } catch (error) {
      throw this.errorHandler.handleError(error, {
        operation: 'find best geocoding match',
        parameters: { locationName, preferredCountry }
      });
    }
  }

  getCacheStats(): { size: number; maxSize: number; expirationTime: number } {
    return {
      size: this.cache.size,
      maxSize: 1000,
      expirationTime: this.cacheExpiration
    };
  }

  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Geocoding cache cleared');
  }

  async testConnection(): Promise<boolean> {
    console.log('🔍 Testing Geocoding API connection...');

    try {
      const results = await this.searchLocation({
        name: 'Paris',
        count: 1
      });

      if (results.length > 0) {
        const firstResult = results[0];
        if (firstResult) {
          console.log(`✅ Geocoding API connection test successful!`);
          console.log(`📍 Test result: ${firstResult.name}, ${firstResult.country} (${firstResult.latitude}, ${firstResult.longitude})`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('❌ Geocoding API connection test failed:', error);
      return false;
    }
  }
}