import { GeocodingService, GeocodingResult } from '../services/geocodingService.js';
import { ErrorHandler } from '../utils/errorHandler.js';

export interface GeocodingParams {
  location: string;
  country?: string;
  language?: string;
  max_results?: number;
}

export interface FormattedLocation {
  name: string;
  full_name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  admin_regions: {
    admin1?: string;
    admin2?: string;
    admin3?: string;
    admin4?: string;
  };
  timezone?: string | undefined;
  population?: number | undefined;
  elevation?: number | undefined;
  feature_type?: string;
}

export interface GeocodingToolResult {
  query: {
    location: string;
    country?: string;
    language: string;
    max_results: number;
  };
  results: FormattedLocation[];
  total_found: number;
  best_match: FormattedLocation | null;
  suggestions: string[];
}

export class GeocodingTool {
  private geocodingService: GeocodingService;
  private errorHandler: ErrorHandler;

  constructor() {
    this.geocodingService = new GeocodingService();
    this.errorHandler = ErrorHandler.getInstance();
  }

  async geocodeLocation(params: GeocodingParams): Promise<string> {
    try {
      this.validateParams(params);

      const maxResults = Math.min(Math.max(params.max_results || 5, 1), 20);
      const language = params.language || 'en';

      console.log(`🌍 Geocoding location: "${params.location}" (language: ${language}, max: ${maxResults})`);

      // Search for locations
      const searchResults = await this.geocodingService.searchLocation({
        name: params.location,
        count: maxResults,
        language: language
      });

      if (searchResults.length === 0) {
        return this.formatNoResultsResponse(params);
      }

      // Filter by country if specified
      let filteredResults = searchResults;
      if (params.country) {
        filteredResults = this.filterByCountry(searchResults, params.country);

        if (filteredResults.length === 0) {
          // If no results in specified country, show all results with a note
          filteredResults = searchResults.slice(0, maxResults);
        }
      }

      // Format the results
      const formattedResults = filteredResults.map(result => this.formatLocation(result));

      // Determine best match
      const bestMatch = this.findBestMatch(formattedResults, params);

      // Generate suggestions for ambiguous queries
      const suggestions = this.generateSuggestions(formattedResults, params);

      const response: GeocodingToolResult = {
        query: {
          location: params.location,
          ...(params.country && { country: params.country }),
          language: language,
          max_results: maxResults
        },
        results: formattedResults,
        total_found: searchResults.length,
        best_match: bestMatch,
        suggestions: suggestions
      };

      return JSON.stringify(response, null, 2);

    } catch (error) {
      throw this.errorHandler.handleError(error, {
        tool: 'geocode_location',
        operation: 'location geocoding',
        parameters: params
      });
    }
  }

  private validateParams(params: GeocodingParams): void {
    if (!params.location || typeof params.location !== 'string') {
      throw this.errorHandler.createValidationError(
        'Location name is required and must be a string',
        { tool: 'geocode_location', operation: 'parameter validation', parameters: params }
      );
    }

    const trimmedLocation = params.location.trim();
    if (trimmedLocation.length < 2) {
      throw this.errorHandler.createValidationError(
        'Location name must be at least 2 characters long',
        { tool: 'geocode_location', operation: 'parameter validation', parameters: params }
      );
    }

    if (trimmedLocation.length > 100) {
      throw this.errorHandler.createValidationError(
        'Location name must be less than 100 characters',
        { tool: 'geocode_location', operation: 'parameter validation', parameters: params }
      );
    }

    if (params.max_results !== undefined && (params.max_results < 1 || params.max_results > 20)) {
      throw this.errorHandler.createValidationError(
        'Maximum results must be between 1 and 20',
        { tool: 'geocode_location', operation: 'parameter validation', parameters: params }
      );
    }

    if (params.language && params.language.length !== 2) {
      throw this.errorHandler.createValidationError(
        'Language must be a 2-letter ISO code (e.g., "en", "fr", "de")',
        { tool: 'geocode_location', operation: 'parameter validation', parameters: params }
      );
    }
  }

  private filterByCountry(results: GeocodingResult[], country: string): GeocodingResult[] {
    const countryLower = country.toLowerCase();

    return results.filter(result => {
      const matchesCountryCode = result.country_code?.toLowerCase() === countryLower;
      const matchesCountryName = result.country?.toLowerCase().includes(countryLower);

      return matchesCountryCode || matchesCountryName;
    });
  }

  private formatLocation(result: GeocodingResult): FormattedLocation {
    // Create a comprehensive display name
    const nameParts = [result.name];

    if (result.admin1 && result.admin1 !== result.name) {
      nameParts.push(result.admin1);
    }

    if (result.country && result.country !== result.admin1) {
      nameParts.push(result.country);
    }

    const fullName = nameParts.join(', ');

    return {
      name: result.name,
      full_name: fullName,
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country || 'Unknown',
      country_code: result.country_code || '',
      admin_regions: {
        ...(result.admin1 && { admin1: result.admin1 }),
        ...(result.admin2 && { admin2: result.admin2 }),
        ...(result.admin3 && { admin3: result.admin3 }),
        ...(result.admin4 && { admin4: result.admin4 })
      },
      timezone: result.timezone,
      population: result.population,
      elevation: result.elevation,
      feature_type: this.getFeatureTypeDescription(result.feature_code)
    };
  }

  private getFeatureTypeDescription(featureCode?: string): string {
    if (!featureCode) return 'Location';

    const featureTypes: Record<string, string> = {
      'PPLC': 'Capital city',
      'PPL': 'City',
      'PPLA': 'Administrative city',
      'PPLA2': 'Regional city',
      'PPLA3': 'District city',
      'PPLA4': 'Local city',
      'PPLX': 'Populated place',
      'ADM1': 'Administrative division',
      'ADM2': 'Administrative subdivision',
      'ADM3': 'Administrative subdivision',
      'ADM4': 'Administrative subdivision',
      'CONT': 'Continent',
      'PCLI': 'Country',
      'ISL': 'Island',
      'MT': 'Mountain',
      'LK': 'Lake',
      'RV': 'River',
      'AIRP': 'Airport'
    };

    return featureTypes[featureCode] || 'Location';
  }

  private findBestMatch(results: FormattedLocation[], params: GeocodingParams): FormattedLocation | null {
    if (results.length === 0) return null;

    const query = params.location.toLowerCase();
    const preferredCountry = params.country?.toLowerCase();

    // Priority scoring system
    let bestMatch = results[0];
    if (!bestMatch) return null;

    let bestScore = this.calculateMatchScore(bestMatch, query, preferredCountry);

    for (let i = 1; i < results.length; i++) {
      const currentResult = results[i];
      if (currentResult) {
        const score = this.calculateMatchScore(currentResult, query, preferredCountry);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = currentResult;
        }
      }
    }

    return bestMatch || null;
  }

  private calculateMatchScore(location: FormattedLocation, query: string, preferredCountry?: string): number {
    let score = 0;

    // Exact name match (highest priority)
    if (location.name.toLowerCase() === query) {
      score += 100;
    } else if (location.name.toLowerCase().includes(query)) {
      score += 50;
    }

    // Country preference
    if (preferredCountry && location.country_code.toLowerCase() === preferredCountry) {
      score += 30;
    }

    // Population bonus (larger cities get higher scores)
    if (location.population) {
      score += Math.min(location.population / 100000, 20); // Max 20 points for population
    }

    // Feature type bonus
    if (location.feature_type?.includes('Capital')) {
      score += 15;
    } else if (location.feature_type?.includes('city')) {
      score += 10;
    }

    return score;
  }

  private generateSuggestions(results: FormattedLocation[], params: GeocodingParams): string[] {
    if (results.length <= 1) return [];

    const suggestions: string[] = [];
    const query = params.location;

    // If multiple countries found, suggest specifying country
    const countries = new Set(results.map(r => r.country));
    if (countries.size > 1 && !params.country) {
      suggestions.push(`Try specifying a country: "${query}, France" or "${query}, USA"`);
    }

    // If many results, suggest being more specific
    if (results.length > 5) {
      suggestions.push(`Multiple locations found. Be more specific with region or country.`);
    }

    // Suggest alternative spellings if no exact match
    const hasExactMatch = results.some(r => r.name.toLowerCase() === query.toLowerCase());
    if (!hasExactMatch && results.length > 0) {
      const firstResult = results[0];
      if (firstResult) {
        suggestions.push(`Did you mean "${firstResult.name}"?`);
      }
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  private formatNoResultsResponse(params: GeocodingParams): string {
    const response = {
      query: {
        location: params.location,
        country: params.country,
        language: params.language || 'en',
        max_results: params.max_results || 5
      },
      results: [],
      total_found: 0,
      best_match: null,
      suggestions: [
        'Check the spelling of the location name',
        'Try using a different language or country specification',
        'Use a more general location name (e.g., "Paris" instead of "Rue de la Paix")',
        'Try searching for a nearby major city first'
      ],
      message: `No locations found for "${params.location}". Please check spelling and try again.`
    };

    return JSON.stringify(response, null, 2);
  }

  async testGeocodingService(): Promise<boolean> {
    return this.geocodingService.testConnection();
  }
}