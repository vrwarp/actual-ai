import * as handlebars from 'handlebars';

/**
 * Handlebars instance with custom helpers registered.
 *
 * This module configures and exports the Handlebars instance used for template rendering.
 */

/**
 * Helper to check for equality between two arguments.
 *
 * @param arg1 - The first argument.
 * @param arg2 - The second argument.
 * @returns True if arguments are strictly equal, false otherwise.
 */
handlebars.registerHelper('eq', (arg1, arg2) => arg1 === arg2);

/**
 * Helper to increment a numerical index by one.
 * Useful for 1-based indexing in templates.
 *
 * @param index - The zero-based index.
 * @returns The incremented index.
 */
handlebars.registerHelper('incIndex', (index: number) => index + 1);

export default handlebars;
