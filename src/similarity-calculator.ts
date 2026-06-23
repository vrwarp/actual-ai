import { PorterStemmer } from 'natural/lib/natural/stemmers';
import { JaroWinklerDistance } from 'natural/lib/natural/distance';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Utility class for calculating string similarity scores.
 * Used for comparing category names or other text strings to find matches.
 */
class SimilarityCalculator {
  /**
   * Calculates a similarity score between two strings.
   *
   * The score is a weighted combination of Jaccard similarity (word overlap)
   * and Jaro-Winkler distance (character-level similarity).
   *
   * @param name1 - The first string to compare.
   * @param name2 - The second string to compare.
   * @returns A number between 0 and 1, where 1 indicates an exact match.
   */
  public calculateNameSimilarity(name1: string, name2: string): number {
    const a = normalize(name1);
    const b = normalize(name2);

    if (a === b) return 1.0;

    // tokenizeAndStem lowercases, drops English stopwords, and applies the
    // Porter stemmer so plurals ("sport"/"sports"), -ies ("category"/
    // "categories"), and -ation ("transport"/"transportation") collapse to
    // the same stem.
    const words1 = new Set(PorterStemmer.tokenizeAndStem(a));
    const words2 = new Set(PorterStemmer.tokenizeAndStem(b));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const wordSimilarity = union.size === 0 ? 0 : intersection.size / union.size;

    // Subset boost: when one name's content words are fully contained in
    // the other's, the shorter name is likely a coarser version of the
    // same concept ("Travel" ⊆ "Travel & Transport"). Nudge the score so
    // these cluster together instead of bloating the category list.
    const smallerSize = Math.min(words1.size, words2.size);
    const isSubset = smallerSize > 0 && intersection.size === smallerSize;
    const subsetBoost = isSubset ? 0.15 : 0;

    const charSimilarity = JaroWinklerDistance(a, b);

    return Math.min(1.0, 0.6 * wordSimilarity + 0.4 * charSimilarity + subsetBoost);
  }
}

export default SimilarityCalculator;
