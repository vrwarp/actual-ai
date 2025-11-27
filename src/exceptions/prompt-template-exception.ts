/**
 * Exception thrown when there is an error processing the prompt template.
 *
 * This error typically indicates a syntax error in the Handlebars template
 * or an issue during template compilation or execution.
 */
export default class PromptTemplateException extends Error {
  /**
   * Constructs a PromptTemplateException.
   *
   * @param message - The error message explaining why the template processing failed.
   */
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateException';
  }
}
