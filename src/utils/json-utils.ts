import { UnifiedResponse } from '../types';

/**
 * Cleans raw text output from an LLM to extract the JSON payload.
 *
 * It removes Markdown code fences, extracts the content between the first `{` and last `}`,
 * or handles cases where the response is a simple string ID.
 *
 * @param text - The raw response text from the LLM.
 * @returns The cleaned JSON string or the original text if it looks like an ID.
 */
function cleanJsonResponse(text: string): string {
  // If the text looks like a UUID or simple ID, return it as is
  if (/^[a-zA-Z0-9_-]+$/.test(text.trim())) {
    return text.trim();
  }

  // Remove markdown code fences and any surrounding text
  let cleaned = text.replace(/```json\n?|\n?```/g, '');
  cleaned = cleaned.trim();

  // If there are no JSON structure characters, return the trimmed text as is
  if (!/[{[]/.test(cleaned) || !/[}\]]/.test(cleaned)) {
    return cleaned;
  }

  // Remove leading characters up to first JSON structure character
  cleaned = cleaned.replace(/^[^{[]*?([{[])/, '$1');
  // Remove trailing characters after last JSON structure character
  cleaned = cleaned.replace(/([}\]])[^}\]]*$/, '$1');

  return cleaned.trim();
}

/**
 * Parses the LLM's text response into a structured UnifiedResponse object.
 *
 * It handles JSON parsing errors and attempts to interpret the response gracefully
 * (e.g., treating a simple string as a category ID).
 *
 * @param text - The raw response text from the LLM.
 * @returns The parsed UnifiedResponse object.
 * @throws Error if the response cannot be parsed or does not match expected formats.
 */
function parseLlmResponse(text: string): UnifiedResponse {
  const cleanedText = cleanJsonResponse(text);
  console.log('Cleaned LLM response:', cleanedText);

  try {
    let parsed: Partial<UnifiedResponse>;
    try {
      parsed = JSON.parse(cleanedText) as Partial<UnifiedResponse>;
    } catch {
      // If not valid JSON, check if it's a simple ID
      const trimmedText = cleanedText.trim().replace(/^"|"$/g, '');

      if (/^[a-zA-Z0-9_-]+$/.test(trimmedText)) {
        console.log(`LLM returned simple ID: "${trimmedText}"`);
        return {
          type: 'existing',
          categoryId: trimmedText,
        };
      }

      throw new Error('Invalid response format from LLM');
    }

    if (parsed.type === 'existing' && parsed.categoryId) {
      return { type: 'existing', categoryId: parsed.categoryId };
    }
    if (parsed.type === 'rule' && parsed.categoryId && parsed.ruleName) {
      return {
        type: 'rule',
        categoryId: parsed.categoryId,
        ruleName: parsed.ruleName,
      };
    }
    if (parsed.type === 'new' && parsed.newCategory) {
      return {
        type: 'new',
        newCategory: parsed.newCategory,
      };
    }

    // If the response doesn't match expected format but has a categoryId,
    // default to treating it as an existing category
    if (parsed.categoryId) {
      console.log('LLM response missing type but has categoryId, treating as existing category');
      return {
        type: 'existing',
        categoryId: parsed.categoryId,
      };
    }
    if (parsed && typeof parsed === 'string') {
      return {
        type: 'existing',
        categoryId: parsed,
      };
    }

    console.error('Invalid response structure from LLM:', parsed);
    throw new Error('Invalid response format from LLM');
  } catch (parseError) {
    console.error('Failed to parse LLM response:', cleanedText, parseError);
    throw new Error('Invalid response format from LLM');
  }
}

export { parseLlmResponse, cleanJsonResponse };
