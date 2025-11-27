import * as https from 'https';
import { SearchResult } from '../types';

/**
 * A free web search service that acts as an alternative to commercial search APIs.
 * It primarily uses scraping of a search engine's "lite" interface to retrieve results.
 */
export default class FreeWebSearchService {
  /**
   * Performs a web search for the given query.
   *
   * @param query - The search query string.
   * @returns A promise that resolves to an array of SearchResult objects.
   */
  public async search(query: string): Promise<SearchResult[]> {
    return this.searchUsingDDG(query);
  }

  /**
   * Implementation of web search using DuckDuckGo Lite.
   *
   * @param query - The search query.
   * @returns A promise resolving to parsed search results.
   */
  private async searchUsingDDG(query: string): Promise<SearchResult[]> {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const html = await this.fetchUrl(url);

    // console.debug('[SearchService] DDG raw response:', html);
    const results: SearchResult[] = [];

    const rowRegex = /<tr>\s*<td[^>]*>(\d+)\.&nbsp;<\/td>\s*<td>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<\/tr>\s*<tr>\s*<td>[^<]*<\/td>\s*<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;
    let match;
    let count = 0;
    while (count < 5) {
      match = rowRegex.exec(html);
      if (match === null) break;

      const [, , link, title, snippet] = match;
      const cleanSnippet = snippet
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const result = {
        title: this.decodeHtmlEntities(title),
        snippet: cleanSnippet,
        link,
      };

      // console.debug('[SearchService] Parsed DDG result:', result);
      results.push(result);

      if (results.length >= 5) break;

      count += 1;
    }

    // console.debug('[SearchService] Final DDG results:', results);
    return results;
  }

  /**
   * Fetches the content of a URL as a string.
   * Includes retry logic for transient errors.
   *
   * @param url - The URL to fetch.
   * @param retries - Number of retry attempts (default: 3).
   * @returns A promise that resolves to the response body string.
   */
  private async fetchUrl(url: string, retries = 3): Promise<string> {
    // console.debug('[SearchService] Fetching URL:', url);
    return new Promise((resolve, reject) => {
      const attempt = () => {
        https.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }, (res) => {
          // console.debug(`[SearchService] HTTP ${res.statusCode} for ${url}`);
          if (res.statusCode === 202 && retries > 0) {
            setTimeout(attempt, 1000);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Request failed with status code ${res.statusCode}`));
            return;
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve(data);
          });
        }).on('error', (err) => {
          reject(err);
        });
      };
      attempt();
    });
  }

  /**
   * Formats the raw search results into a single string summary.
   *
   * @param results - The array of SearchResult objects.
   * @returns A formatted string suitable for inclusion in an LLM prompt.
   */
  public formatSearchResults(results: SearchResult[]): string {
    if (!results || results.length === 0) {
      return 'No relevant business information found.';
    }

    // Format results
    const formattedResults = results
      .map((result, index) => `[Source ${index + 1}] ${result.title}\n`
        + `${result.snippet.substring(0, 150)}...\n`
        + `URL: ${result.link}`)
      .join('\n\n');

    return `SEARCH RESULTS:\n${formattedResults}`;
  }

  /**
   * Decodes basic HTML entities in a string.
   *
   * @param html - The string with HTML entities.
   * @returns The decoded string.
   */
  private decodeHtmlEntities(html: string): string {
    return html
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}
